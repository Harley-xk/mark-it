#!/usr/bin/env node
/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: OSS multipart 分片上传适配层：分片计划、STS 签名、并发重试、进度、完成、中止与大小校验
 */
import { createHmac } from 'node:crypto'
import { createReadStream } from 'node:fs'
import https from 'node:https'
import { setTimeout as delay } from 'node:timers/promises'

export const MIB = 1024 * 1024
export const OSS_MIN_PART_SIZE = 100 * 1024
export const OSS_MAX_PARTS = 10_000

export const MULTIPART_DEFAULTS = Object.freeze({
  thresholdBytes: 64 * MIB,
  partSizeBytes: 16 * MIB,
  concurrency: 4,
  partRetries: 3,
  partTimeoutMs: 90_000,
  progressIntervalMs: 15_000,
  retryBaseDelayMs: 500
})

export class OssTransferError extends Error {
  constructor(message, { retryable = false, statusCode, operation, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'OssTransferError'
    this.retryable = retryable
    this.statusCode = statusCode
    this.operation = operation
  }
}

export function isObjectSizeCheckForbidden(error) {
  return error instanceof OssTransferError && error.operation === 'HEAD' && error.statusCode === 403
}

export function isRetryableStatus(statusCode) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500
}

export function shouldUseMultipart(
  fileSize,
  { thresholdBytes = MULTIPART_DEFAULTS.thresholdBytes } = {}
) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0)
    throw new TypeError('fileSize 必须是非负安全整数')
  if (!Number.isSafeInteger(thresholdBytes) || thresholdBytes < 0)
    throw new TypeError('thresholdBytes 必须是非负安全整数')
  return fileSize > thresholdBytes
}

export function planParts(fileSize, partSizeBytes) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0)
    throw new RangeError('fileSize 必须是正安全整数')
  if (!Number.isSafeInteger(partSizeBytes) || partSizeBytes <= 0)
    throw new RangeError('partSizeBytes 必须是正安全整数')

  const partCount = Math.ceil(fileSize / partSizeBytes)
  if (partCount > OSS_MAX_PARTS)
    throw new RangeError(`分片数量 ${partCount} 超过 OSS 上限 ${OSS_MAX_PARTS}`)

  const parts = []
  for (let index = 0; index < partCount; index++) {
    const start = index * partSizeBytes
    const end = Math.min(start + partSizeBytes, fileSize) - 1
    parts.push({
      partNumber: index + 1,
      start,
      end,
      size: end - start + 1
    })
  }
  return parts
}

export function validateMultipartOptions({
  fileSize,
  partSizeBytes = MULTIPART_DEFAULTS.partSizeBytes,
  concurrency = MULTIPART_DEFAULTS.concurrency,
  partRetries = MULTIPART_DEFAULTS.partRetries,
  partTimeoutMs = MULTIPART_DEFAULTS.partTimeoutMs,
  progressIntervalMs = MULTIPART_DEFAULTS.progressIntervalMs
}) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0)
    throw new RangeError('fileSize 必须是正安全整数')
  if (!Number.isSafeInteger(partSizeBytes) || partSizeBytes < OSS_MIN_PART_SIZE)
    throw new RangeError(`分片大小不得小于 ${OSS_MIN_PART_SIZE} 字节`)
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0)
    throw new RangeError('concurrency 必须是正整数')
  if (!Number.isSafeInteger(partRetries) || partRetries < 0)
    throw new RangeError('partRetries 必须是非负整数')
  if (!Number.isSafeInteger(partTimeoutMs) || partTimeoutMs <= 0)
    throw new RangeError('partTimeoutMs 必须是正整数')
  if (!Number.isSafeInteger(progressIntervalMs) || progressIntervalMs <= 0)
    throw new RangeError('progressIntervalMs 必须是正整数')

  return {
    parts: planParts(fileSize, partSizeBytes),
    partSizeBytes,
    concurrency,
    partRetries,
    partTimeoutMs,
    progressIntervalMs
  }
}

export function encodeOssObjectPath(objectKey) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function sortedSubresources(subresources = {}) {
  return Object.entries(subresources)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
}

export function encodeOssSubresources(subresources = {}) {
  return sortedSubresources(subresources)
    .map(([key, value]) => {
      const raw = String(value)
      return raw === '' ? key : `${key}=${encodeURIComponent(raw)}`
    })
    .join('&')
}

export function buildOssCanonicalResource(credential, objectKey, subresources = {}) {
  const entries = sortedSubresources(subresources)
  const query = entries
    .map(([key, value]) => {
      const raw = String(value)
      return raw === '' ? key : `${key}=${raw}`
    })
    .join('&')
  return `/${credential.bucket}/${objectKey}${query ? `?${query}` : ''}`
}

export function buildOssStringToSign({ method, date, credential, objectKey, subresources = {} }) {
  return [
    method.toUpperCase(),
    '',
    '',
    date,
    `x-oss-security-token:${credential.securityToken}`,
    buildOssCanonicalResource(credential, objectKey, subresources)
  ].join('\n')
}

export function buildOssAuthorization({ method, date, credential, objectKey, subresources }) {
  const stringToSign = buildOssStringToSign({
    method,
    date,
    credential,
    objectKey,
    subresources
  })
  const signature = createHmac('sha1', credential.accessKeySecret)
    .update(stringToSign)
    .digest('base64')
  return `OSS ${credential.accessKeyId}:${signature}`
}

export function buildOssHost(credential) {
  return `${credential.bucket}.${
    credential.region.includes('.') ? credential.region : `${credential.region}.aliyuncs.com`
  }`
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildCompleteMultipartXml(parts) {
  if (!Array.isArray(parts) || parts.length === 0)
    throw new RangeError('CompleteMultipartUpload 至少需要一个分片')

  const seen = new Set()
  const sorted = [...parts].sort((left, right) => left.partNumber - right.partNumber)
  for (const part of sorted) {
    if (!Number.isSafeInteger(part.partNumber) || part.partNumber <= 0)
      throw new RangeError('partNumber 必须是正整数')
    if (seen.has(part.partNumber)) throw new RangeError(`partNumber ${part.partNumber} 重复`)
    if (typeof part.etag !== 'string' || !part.etag)
      throw new RangeError(`partNumber ${part.partNumber} 缺少 ETag`)
    seen.add(part.partNumber)
  }

  const partXml = sorted
    .map(
      (part) =>
        `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`
    )
    .join('')
  return `<CompleteMultipartUpload>${partXml}</CompleteMultipartUpload>`
}

export function redactSensitiveText(text) {
  return String(text)
    .replace(/\b(authorization)\b\s*[:=]\s*OSS\s+[^\s,<]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]')
    .replace(
      /\b(accessKeyId|accessKeySecret|access_key_id|access_key_secret|securityToken|security_token|x-oss-security-token|signature|password|passwd|signSecret|jwt)\b\s*[:=]\s*[^\s,<]+/gi,
      '$1=[redacted]'
    )
    .replace(/\bLTAI[A-Za-z0-9]{8,}\b/g, '[redacted-access-key]')
    .replace(/\b(authorization)\b\s*[:=]\s*[^\s,<]+/gi, '$1=[redacted]')
    .slice(0, 300)
}

export function describeOssResponse(statusCode, body = '') {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
  const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1]
  if (!code && !message) return `HTTP ${statusCode}`
  return redactSensitiveText(`${code ?? 'OSSError'}: ${message ?? ''}`)
}

function headerValue(headers, name) {
  if (!headers) return undefined
  return headers[name] ?? headers[name.toLowerCase()]
}

function decodeXmlText(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function extractXmlValue(body, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(String(body))
  return match ? decodeXmlText(match[1]) : null
}

function requestOss({
  method,
  credential,
  objectKey,
  subresources = {},
  headers = {},
  body,
  bodyStream,
  timeoutMs
}) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString()
    const encodedPath = encodeOssObjectPath(objectKey)
    const encodedQuery = encodeOssSubresources(subresources)
    const requestHeaders = {
      Date: date,
      'x-oss-security-token': credential.securityToken,
      Authorization: buildOssAuthorization({
        method,
        date,
        credential,
        objectKey,
        subresources
      }),
      ...headers
    }
    const request = https.request(
      {
        hostname: buildOssHost(credential),
        path: `/${encodedPath}${encodedQuery ? `?${encodedQuery}` : ''}`,
        method,
        headers: requestHeaders
      },
      (response) => {
        const chunks = []
        let total = 0
        response.on('data', (chunk) => {
          if (total < 256 * 1024) {
            const remaining = 256 * 1024 - total
            const kept = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining)
            chunks.push(kept)
            total += kept.length
          }
        })
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        })
        response.on('error', (error) => {
          reject(new OssTransferError(`OSS response failed: ${error.message}`, { retryable: true }))
        })
      }
    )

    const rejectAndDestroy = (error) => {
      const wrapped =
        error instanceof OssTransferError
          ? error
          : new OssTransferError(`OSS request failed: ${error.message}`, {
              retryable: true,
              cause: error
            })
      request.destroy()
      bodyStream?.destroy?.()
      reject(wrapped)
    }

    request.on('error', rejectAndDestroy)
    if (timeoutMs) {
      request.setTimeout(timeoutMs, () => {
        rejectAndDestroy(
          new OssTransferError(`OSS request stalled for ${timeoutMs} ms`, { retryable: true })
        )
      })
    }

    if (bodyStream) {
      bodyStream.on('error', rejectAndDestroy)
      bodyStream.pipe(request)
    } else {
      if (body !== undefined) request.write(body)
      request.end()
    }
  })
}

function assertSuccessfulResponse(result, action) {
  if (result.statusCode >= 200 && result.statusCode < 300) return
  throw new OssTransferError(
    `${action}失败（${describeOssResponse(result.statusCode, result.body)}）`,
    {
      retryable: isRetryableStatus(result.statusCode),
      statusCode: result.statusCode,
      operation: action
    }
  )
}

export function createOssMultipartTransport({
  credential,
  request = requestOss,
  openStream = createReadStream
}) {
  return {
    async initiate(objectKey) {
      const result = await request({
        method: 'POST',
        credential,
        objectKey,
        subresources: { uploads: '' }
      })
      assertSuccessfulResponse(result, 'InitiateMultipartUpload')
      const uploadId = extractXmlValue(result.body, 'UploadId')
      if (!uploadId) throw new OssTransferError('InitiateMultipartUpload 响应缺少 UploadId')
      return uploadId
    },

    async uploadPart(objectKey, uploadId, part, filePath, options = {}) {
      const stream = openStream(filePath, { start: part.start, end: part.end })
      if (options.onProgress) {
        stream.on('data', (chunk) => options.onProgress(chunk.length))
      }
      const result = await request({
        method: 'PUT',
        credential,
        objectKey,
        subresources: {
          partNumber: part.partNumber,
          uploadId
        },
        headers: {
          'Content-Length': part.size
        },
        bodyStream: stream,
        timeoutMs: options.timeoutMs
      })
      assertSuccessfulResponse(result, `UploadPart ${part.partNumber}`)
      const etag = headerValue(result.headers, 'etag')
      if (!etag)
        throw new OssTransferError(`UploadPart ${part.partNumber} 响应缺少 ETag`, {
          retryable: true
        })
      return etag
    },

    async complete(objectKey, uploadId, parts) {
      const xml = buildCompleteMultipartXml(parts)
      const result = await request({
        method: 'POST',
        credential,
        objectKey,
        subresources: { uploadId },
        headers: {
          'Content-Length': Buffer.byteLength(xml)
        },
        body: xml
      })
      assertSuccessfulResponse(result, 'CompleteMultipartUpload')
      return result
    },

    async abort(objectKey, uploadId) {
      const result = await request({
        method: 'DELETE',
        credential,
        objectKey,
        subresources: { uploadId }
      })
      if (result.statusCode >= 200 && result.statusCode < 300) return
      const code = /<Code>([^<]+)<\/Code>/.exec(result.body)?.[1]
      if (result.statusCode === 404 || code === 'NoSuchUpload') return
      throw new OssTransferError(
        `AbortMultipartUpload失败（${describeOssResponse(result.statusCode, result.body)}）`,
        { retryable: isRetryableStatus(result.statusCode) }
      )
    },

    async head(objectKey) {
      const result = await request({
        method: 'HEAD',
        credential,
        objectKey
      })
      assertSuccessfulResponse(result, 'HEAD')
      const rawSize = headerValue(result.headers, 'content-length')
      const size = Number(rawSize)
      if (!Number.isSafeInteger(size) || size < 0)
        throw new OssTransferError('HEAD 响应缺少有效 Content-Length')
      return size
    },

    async assertObjectSize(objectKey, expectedSize) {
      const actualSize = await this.head(objectKey)
      if (actualSize !== expectedSize)
        throw new OssTransferError(
          `对象大小校验失败：期望 ${expectedSize} 字节，实际 ${actualSize} 字节`
        )
      return actualSize
    }
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MIB) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 * MIB) return `${(bytes / MIB).toFixed(1)} MiB`
  return `${(bytes / (1024 * MIB)).toFixed(2)} GiB`
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--'
  const rounded = Math.ceil(seconds)
  const minutes = Math.floor(rounded / 60)
  const remaining = String(rounded % 60).padStart(2, '0')
  return `${String(minutes).padStart(2, '0')}:${remaining}`
}

export function formatProgressLine({
  label,
  completedParts,
  partCount,
  uploadedBytes,
  totalBytes,
  elapsedMs
}) {
  const percent = totalBytes === 0 ? 100 : Math.min(100, (uploadedBytes / totalBytes) * 100)
  const speed = elapsedMs > 0 ? uploadedBytes / (elapsedMs / 1000) : 0
  const eta = speed > 0 ? (totalBytes - uploadedBytes) / speed : Number.POSITIVE_INFINITY
  return `[${label}] multipart ${completedParts}/${partCount} parts, ${formatBytes(
    uploadedBytes
  )}/${formatBytes(totalBytes)} (${percent.toFixed(1)}%), ${formatBytes(speed)}/s, ETA ${formatEta(
    eta
  )}`
}

function calculateBackoff(attempt, retryBaseDelayMs, random) {
  const cap = retryBaseDelayMs * 2 ** attempt
  return Math.floor(cap / 2 + random() * (cap / 2))
}

function normalizeTransferError(error, partNumber, attempts) {
  const message = redactSensitiveText(error instanceof Error ? error.message : String(error))
  return new OssTransferError(`分片 ${partNumber} 在 ${attempts} 次尝试后失败：${message}`, {
    cause: error
  })
}

export async function uploadMultipart({
  filePath,
  fileSize,
  objectKey,
  transport,
  label = 'upload',
  partSizeBytes = MULTIPART_DEFAULTS.partSizeBytes,
  concurrency = MULTIPART_DEFAULTS.concurrency,
  partRetries = MULTIPART_DEFAULTS.partRetries,
  partTimeoutMs = MULTIPART_DEFAULTS.partTimeoutMs,
  progressIntervalMs = MULTIPART_DEFAULTS.progressIntervalMs,
  retryBaseDelayMs = MULTIPART_DEFAULTS.retryBaseDelayMs,
  log = console.log,
  warn = console.warn,
  now = Date.now,
  sleep = delay,
  backoff = (attempt) => calculateBackoff(attempt, retryBaseDelayMs, Math.random)
}) {
  if (!transport) throw new TypeError('transport 必填')
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath 必填')
  if (typeof objectKey !== 'string' || !objectKey) throw new TypeError('objectKey 必填')

  const options = validateMultipartOptions({
    fileSize,
    partSizeBytes,
    concurrency,
    partRetries,
    partTimeoutMs,
    progressIntervalMs
  })
  const { parts } = options
  const startedAt = now()
  let lastReportAt = startedAt
  let lastPercentBucket = -1
  let completedBytes = 0
  let completedPartCount = 0
  const activeBytes = new Map()

  const reportProgress = ({ force = false } = {}) => {
    const currentTime = now()
    const uploadedBytes = Math.min(
      fileSize,
      completedBytes + [...activeBytes.values()].reduce((sum, value) => sum + value, 0)
    )
    const percentBucket = Math.floor((uploadedBytes / fileSize) * 20)
    if (
      !force &&
      percentBucket <= lastPercentBucket &&
      currentTime - lastReportAt < progressIntervalMs
    )
      return
    lastReportAt = currentTime
    lastPercentBucket = percentBucket
    log(
      formatProgressLine({
        label,
        completedParts: completedPartCount,
        partCount: parts.length,
        uploadedBytes,
        totalBytes: fileSize,
        elapsedMs: currentTime - startedAt
      })
    )
  }

  const uploadPart = async (part) => {
    let lastError
    for (let attempt = 0; attempt <= partRetries; attempt++) {
      activeBytes.set(part.partNumber, 0)
      try {
        const etag = await transport.uploadPart(objectKey, uploadId, part, filePath, {
          timeoutMs: partTimeoutMs,
          onProgress: (bytes) => {
            activeBytes.set(part.partNumber, (activeBytes.get(part.partNumber) ?? 0) + bytes)
            reportProgress()
          }
        })
        activeBytes.delete(part.partNumber)
        completedBytes += part.size
        completedPartCount++
        reportProgress({ force: true })
        return { partNumber: part.partNumber, etag }
      } catch (error) {
        activeBytes.delete(part.partNumber)
        lastError = error
        if (!(error instanceof OssTransferError) || !error.retryable || attempt === partRetries)
          throw normalizeTransferError(error, part.partNumber, attempt + 1)

        const retryDelay = backoff(attempt)
        warn(
          `  [${label}] 分片 ${part.partNumber}/${parts.length} 失败（${redactSensitiveText(
            error.message
          )}），${retryDelay > 0 ? `${retryDelay} ms 后` : ''}重试 ${attempt + 1}/${partRetries}`
        )
        await sleep(retryDelay)
      }
    }
    throw lastError
  }

  let uploadId
  let completeSucceeded = false
  const completed = []
  uploadId = await transport.initiate(objectKey)

  try {
    let nextIndex = 0
    let terminalError = null
    const worker = async () => {
      while (!terminalError) {
        const index = nextIndex++
        if (index >= parts.length) return
        try {
          completed.push(await uploadPart(parts[index]))
        } catch (error) {
          terminalError ??= error
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, worker))
    if (terminalError) throw terminalError

    completed.sort((left, right) => left.partNumber - right.partNumber)
    await transport.complete(objectKey, uploadId, completed)
    completeSucceeded = true
    reportProgress({ force: true })
    return { uploadId, parts: completed }
  } catch (error) {
    if (!completeSucceeded) {
      try {
        await transport.abort(objectKey, uploadId)
        warn(`  [${label}] 分片上传失败，已中止 OSS 会话`)
      } catch (abortError) {
        warn(
          `  [${label}] 分片上传失败，且中止 OSS 会话失败：${
            abortError instanceof Error
              ? redactSensitiveText(abortError.message)
              : redactSensitiveText(String(abortError))
          }`
        )
      }
    }
    throw error
  }
}
