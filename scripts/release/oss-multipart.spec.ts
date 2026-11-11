import { describe, expect, it, vi } from 'vitest'
import {
  MULTIPART_DEFAULTS,
  OSS_MAX_PARTS,
  OSS_MIN_PART_SIZE,
  OssTransferError,
  buildCompleteMultipartXml,
  buildOssCanonicalResource,
  describeOssResponse,
  encodeOssSubresources,
  isObjectSizeCheckForbidden,
  planParts,
  shouldUseMultipart,
  uploadMultipart
} from './oss-multipart.mjs'

describe('OSS multipart 分片计划', () => {
  it('超过阈值时才启用分片', () => {
    const threshold = MULTIPART_DEFAULTS.thresholdBytes
    expect(shouldUseMultipart(threshold, { thresholdBytes: threshold })).toBe(false)
    expect(shouldUseMultipart(threshold + 1, { thresholdBytes: threshold })).toBe(true)
  })

  it('按闭区间生成分片并保留最后短分片', () => {
    const size = OSS_MIN_PART_SIZE * 2 + 123
    const parts = planParts(size, OSS_MIN_PART_SIZE)

    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({
      partNumber: 1,
      start: 0,
      end: OSS_MIN_PART_SIZE - 1,
      size: OSS_MIN_PART_SIZE
    })
    expect(parts[1]).toEqual({
      partNumber: 2,
      start: OSS_MIN_PART_SIZE,
      end: OSS_MIN_PART_SIZE * 2 - 1,
      size: OSS_MIN_PART_SIZE
    })
    expect(parts[2]).toEqual({
      partNumber: 3,
      start: OSS_MIN_PART_SIZE * 2,
      end: size - 1,
      size: 123
    })
  })

  it('拒绝超过 OSS 分片数量上限的文件计划', () => {
    expect(() => planParts(OSS_MAX_PARTS * OSS_MIN_PART_SIZE + 1, OSS_MIN_PART_SIZE)).toThrow(
      '超过 OSS 上限'
    )
  })
})

describe('OSS multipart 请求签名与完成报文', () => {
  it('CanonicalizedResource 使用原始键并按顺序携带子资源', () => {
    const credential = { bucket: 'release-bucket', securityToken: 'temporary-token' }
    expect(
      buildOssCanonicalResource(credential, 'packages/mark it.zip', {
        uploadId: 'upload+1',
        partNumber: 7
      })
    ).toBe('/release-bucket/packages/mark it.zip?partNumber=7&uploadId=upload+1')
    expect(buildOssCanonicalResource(credential, 'packages/mark it.zip', { uploads: '' })).toBe(
      '/release-bucket/packages/mark it.zip?uploads'
    )
  })

  it('请求查询串只编码值，不破坏子资源名称', () => {
    expect(encodeOssSubresources({ uploads: '', uploadId: 'upload+1', partNumber: 2 })).toBe(
      'partNumber=2&uploadId=upload%2B1&uploads'
    )
  })

  it('乱序完成时按 partNumber 升序生成 Complete XML', () => {
    const xml = buildCompleteMultipartXml([
      { partNumber: 3, etag: '"etag-3"' },
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' }
    ])

    expect(xml.indexOf('<PartNumber>1</PartNumber>')).toBeLessThan(
      xml.indexOf('<PartNumber>2</PartNumber>')
    )
    expect(xml.indexOf('<PartNumber>2</PartNumber>')).toBeLessThan(
      xml.indexOf('<PartNumber>3</PartNumber>')
    )
  })
})

describe('OSS multipart 重试与中止', () => {
  it('只重试失败分片，并在完成后按顺序提交', async () => {
    const attempts = new Map<number, number>()
    const uploadPart = vi.fn(
      async (_objectKey: string, _uploadId: string, part: { partNumber: number }) => {
        const count = (attempts.get(part.partNumber) ?? 0) + 1
        attempts.set(part.partNumber, count)
        if (part.partNumber === 2 && count === 1)
          throw new OssTransferError('temporary outage', { retryable: true })
        return `"etag-${part.partNumber}"`
      }
    )
    const complete = vi.fn(async () => undefined)
    const abort = vi.fn(async () => undefined)

    await uploadMultipart({
      filePath: 'ignored.zip',
      fileSize: OSS_MIN_PART_SIZE * 3,
      objectKey: 'packages/mark-it.zip',
      partSizeBytes: OSS_MIN_PART_SIZE,
      concurrency: 2,
      partRetries: 1,
      transport: {
        initiate: vi.fn(async () => 'upload-1'),
        uploadPart,
        complete,
        abort
      },
      log: vi.fn(),
      warn: vi.fn(),
      sleep: async () => undefined,
      backoff: () => 0
    })

    expect(attempts.get(1)).toBe(1)
    expect(attempts.get(2)).toBe(2)
    expect(attempts.get(3)).toBe(1)
    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0][2].map((part) => part.partNumber)).toEqual([1, 2, 3])
    expect(abort).not.toHaveBeenCalled()
  })

  it('不可恢复失败时中止会话且不提交完成', async () => {
    const complete = vi.fn(async () => undefined)
    const abort = vi.fn(async () => undefined)

    await expect(
      uploadMultipart({
        filePath: 'ignored.zip',
        fileSize: OSS_MIN_PART_SIZE,
        objectKey: 'packages/mark-it.zip',
        partSizeBytes: OSS_MIN_PART_SIZE,
        concurrency: 1,
        partRetries: 3,
        transport: {
          initiate: vi.fn(async () => 'upload-1'),
          uploadPart: vi.fn(async () => {
            throw new OssTransferError('access denied', { retryable: false })
          }),
          complete,
          abort
        },
        log: vi.fn(),
        warn: vi.fn(),
        sleep: async () => undefined
      })
    ).rejects.toThrow('分片 1')

    expect(complete).not.toHaveBeenCalled()
    expect(abort).toHaveBeenCalledOnce()
  })
})

describe('OSS multipart 日志脱敏', () => {
  it('错误摘要不输出凭证正文', () => {
    const message = describeOssResponse(
      403,
      '<Error><Code>AccessDenied</Code><Message>securityToken: SECRET-TOKEN denied</Message></Error>'
    )
    expect(message).toContain('AccessDenied')
    expect(message).not.toContain('SECRET-TOKEN')

    const unknownResponse = describeOssResponse(500, '<Detail>AccessKeyId=SECRET-KEY</Detail>')
    expect(unknownResponse).toBe('HTTP 500')
  })
})

describe('OSS multipart 对象大小复核', () => {
  it('只在 HEAD 被 STS 拒绝时允许跳过只读复核', () => {
    expect(
      isObjectSizeCheckForbidden(
        new OssTransferError('HEAD失败（HTTP 403）', {
          statusCode: 403,
          operation: 'HEAD'
        })
      )
    ).toBe(true)
    expect(
      isObjectSizeCheckForbidden(
        new OssTransferError('UploadPart 1失败（HTTP 403）', {
          statusCode: 403,
          operation: 'UploadPart 1'
        })
      )
    ).toBe(false)
    expect(isObjectSizeCheckForbidden(new Error('HEAD failed'))).toBe(false)
  })
})
