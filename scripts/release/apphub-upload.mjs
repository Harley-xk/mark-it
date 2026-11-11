#!/usr/bin/env node
/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: AppHub 上传适配入口：小文件委托原 CLI，大文件使用 OSS multipart 并保持包登记语义
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { ApphubClient, CliError, hashFile, loadConfig, ossPutObject } from './apphub.mjs'
import {
  MULTIPART_DEFAULTS,
  createOssMultipartTransport,
  isObjectSizeCheckForbidden,
  planParts,
  shouldUseMultipart,
  uploadMultipart
} from './oss-multipart.mjs'

const APPHUB_CLI = fileURLToPath(new URL('./apphub.mjs', import.meta.url))

function ok(message) {
  console.log(`✓ ${message}`)
}

function readPositiveIntegerEnv(name, fallback, { allowZero = false } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new CliError(`${name} 必须是${allowZero ? '非负' : '正'}整数，当前值：${raw}`)
  return value
}

function resolveCredentials(config) {
  const credentials = config.credentials ?? {}
  const username = process.env.APPHUB_USERNAME ?? credentials.username
  const password = process.env.APPHUB_PASSWORD ?? credentials.password
  const signSecret = process.env.APPHUB_SIGN_SECRET ?? credentials.signSecret
  if (!username || !password) {
    throw new CliError(
      '缺少发版账号凭据：请设置 APPHUB_USERNAME / APPHUB_PASSWORD，或在配置文件 credentials 节填写'
    )
  }
  return { username, password, signSecret }
}

async function pageAll(client, apiPath, baseQuery = {}) {
  const rows = []
  let pageNo = 1
  for (;;) {
    const data = await client.get(apiPath, { ...baseQuery, pageNo, pageSize: 100 })
    rows.push(...(data.list ?? []))
    if (rows.length >= (data.total ?? 0) || (data.list ?? []).length === 0) return rows
    pageNo++
  }
}

async function resolveVersion(client, config, versionText) {
  const apps = await pageAll(client, '/appcenter/app')
  const app = apps.find((item) => item.appKey === client.appKey)
  if (!app)
    throw new CliError(`平台上未找到 appKey 为 ${client.appKey} 的应用（列表共 ${apps.length} 个）`)

  const channels = await client.get(`/appcenter/app/${app.id}/channel`)
  const channel = channels.find((item) => item.code === config.channel)
  if (!channel) {
    throw new CliError(
      `应用未配置通道 ${config.channel}（现有：${channels.map((item) => item.code).join('、') || '无'}）`
    )
  }

  const versions = await pageAll(client, `/appcenter/app/${app.id}/version`, {
    channelId: channel.id
  })
  const version = versions.find((item) => item.version === versionText)
  if (!version)
    throw new CliError(`通道 ${channel.code} 下不存在版本 ${versionText}，请先 create-version`)
  if (!['draft', 'published'].includes(version.status)) {
    throw new CliError(
      `版本 ${versionText} 当前状态为 ${version.status}，上传安装包要求 draft / published`
    )
  }
  return version
}

function buildLegacyArgs(values) {
  const args = ['upload']
  if (values.config) args.push('--config', values.config)
  for (const key of ['version', 'platform', 'arch', 'file', 'blockmap', 'sig-file']) {
    if (values[key]) args.push(`--${key}`, values[key])
  }
  if (values.replace) args.push('--replace')
  return args
}

function delegateToApphub(values) {
  const result = spawnSync(process.execPath, [APPHUB_CLI, ...buildLegacyArgs(values)], {
    stdio: 'inherit',
    env: process.env
  })
  if (result.error) throw new CliError(`调用 apphub.mjs 失败：${result.error.message}`)
  return result.status ?? 1
}

function resolveMultipartMode(explicit) {
  const mode = String(explicit ?? process.env.APPHUB_MULTIPART ?? 'auto').toLowerCase()
  if (!['auto', 'off'].includes(mode))
    throw new CliError(`--multipart 只支持 auto / off，当前值：${mode}`)
  return mode
}

async function transferObject({
  credential,
  objectKey,
  filePath,
  fileSize,
  label,
  thresholdBytes,
  multipartOptions
}) {
  if (!shouldUseMultipart(fileSize, { thresholdBytes })) {
    await ossPutObject(credential, objectKey, filePath, fileSize)
    ok(`${label} 已单次直传：${objectKey}（${fileSize} 字节）`)
    return 'single'
  }

  const parts = planParts(fileSize, multipartOptions.partSizeBytes)
  console.log(
    `[${label}] multipart 开始：${parts.length} 片，分片 ${multipartOptions.partSizeBytes} 字节，并发 ${multipartOptions.concurrency}`
  )
  const transport = createOssMultipartTransport({ credential })
  await uploadMultipart({
    filePath,
    fileSize,
    objectKey,
    transport,
    label,
    ...multipartOptions
  })
  try {
    await transport.assertObjectSize(objectKey, fileSize)
  } catch (error) {
    if (!isObjectSizeCheckForbidden(error)) throw error
    console.warn(
      `  [${label}] STS 凭证不允许 HEAD 读取；分片均成功且 Complete 已确认，跳过对象大小复核`
    )
  }
  ok(`${label} 已分片直传：${objectKey}（${fileSize} 字节）`)
  return 'multipart'
}

export async function uploadLargePackage({ client, config, values, stat }) {
  const { platform, arch, file, blockmap } = values
  const replaceExisting = Boolean(values.replace)
  const version = await resolveVersion(client, config, values.version)
  if (version.status === 'published' && replaceExisting) {
    console.log('  注意：替换只影响之后的新下载 / 新安装；版本号未变，已安装客户端不会自动更新。')
  }

  ok(`计算哈希（流式）：${file}`)
  const hash = await hashFile(file)
  console.log(`  sha256 = ${hash.sha256}`)
  console.log(`  sha512 = ${hash.sha512}`)

  let minisignSignature
  if (values['sig-file']) {
    minisignSignature = (await fs.readFile(values['sig-file'], 'utf8')).trim()
    if (!minisignSignature) throw new CliError(`minisign 签名文件为空：${values['sig-file']}`)
    ok(`已读取 minisign 签名：${values['sig-file']}`)
  }

  let blockmapSha512
  let blockmapFileSize
  let blockmapStat
  if (blockmap) {
    blockmapStat = await fs.stat(blockmap).catch(() => null)
    if (!blockmapStat?.isFile()) throw new CliError(`blockmap 文件不存在：${blockmap}`)
    const blockmapHash = await hashFile(blockmap)
    blockmapSha512 = blockmapHash.sha512
    blockmapFileSize = blockmapStat.size
  }

  const uploadBody = { platform, fileName: path.basename(file) }
  if (arch) uploadBody.arch = arch
  if (replaceExisting) uploadBody.replaceExisting = true
  const credential = await client.request(
    'POST',
    `/appcenter/version/${version.id}/package/upload-token`,
    { body: uploadBody }
  )
  if (!credential?.objectKey) throw new CliError('upload-token 响应缺少 objectKey')
  if (blockmap && !credential.blockmapObjectKey)
    throw new CliError('upload-token 响应缺少 blockmapObjectKey')
  ok(
    `STS 凭证已签发（${credential.region} / ${credential.bucket}，${new Date(
      credential.expiration
    ).toLocaleString()} 过期）`
  )

  const thresholdBytes = readPositiveIntegerEnv(
    'APPHUB_MULTIPART_THRESHOLD_BYTES',
    MULTIPART_DEFAULTS.thresholdBytes,
    { allowZero: true }
  )
  const multipartOptions = {
    partSizeBytes: readPositiveIntegerEnv(
      'APPHUB_MULTIPART_PART_SIZE_BYTES',
      MULTIPART_DEFAULTS.partSizeBytes
    ),
    concurrency: readPositiveIntegerEnv(
      'APPHUB_MULTIPART_CONCURRENCY',
      MULTIPART_DEFAULTS.concurrency
    ),
    partRetries: readPositiveIntegerEnv(
      'APPHUB_MULTIPART_RETRIES',
      MULTIPART_DEFAULTS.partRetries,
      { allowZero: true }
    ),
    partTimeoutMs: readPositiveIntegerEnv(
      'APPHUB_MULTIPART_PART_TIMEOUT_MS',
      MULTIPART_DEFAULTS.partTimeoutMs
    ),
    progressIntervalMs: readPositiveIntegerEnv(
      'APPHUB_MULTIPART_PROGRESS_INTERVAL_MS',
      MULTIPART_DEFAULTS.progressIntervalMs
    )
  }

  const packageMode = await transferObject({
    credential,
    objectKey: credential.objectKey,
    filePath: file,
    fileSize: stat.size,
    label: `${platform}${arch ? `-${arch}` : ''}`,
    thresholdBytes,
    multipartOptions
  })
  if (blockmap) {
    await transferObject({
      credential,
      objectKey: credential.blockmapObjectKey,
      filePath: blockmap,
      fileSize: blockmapFileSize,
      label: `${platform}${arch ? `-${arch}` : ''}-blockmap`,
      thresholdBytes,
      multipartOptions
    })
  }

  const registerBody = {
    platform,
    fileName: path.basename(file),
    objectKey: credential.objectKey,
    sha256: hash.sha256,
    sha512: hash.sha512
  }
  if (arch) registerBody.arch = arch
  if (minisignSignature) registerBody.minisignSignature = minisignSignature
  if (blockmapSha512) {
    registerBody.blockmapSha512 = blockmapSha512
    registerBody.blockmapFileSize = blockmapFileSize
  }
  if (replaceExisting) registerBody.replaceExisting = true

  const packageId = await client.request('POST', `/appcenter/version/${version.id}/package`, {
    body: registerBody
  })
  ok(
    `包记录已${replaceExisting ? '替换' : '登记'}（packageId ${packageId}）：${platform}${
      arch ? `-${arch}` : ''
    } ← ${path.basename(file)}`
  )
  return {
    packageId,
    mode: packageMode
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(
      '用法：node scripts/release/apphub-upload.mjs upload --config <文件> --version <版本> --platform <平台> --file <安装包> [--arch <架构>] [--blockmap <文件>] [--replace] [--multipart auto|off]'
    )
    return
  }
  if (argv[0] !== 'upload') throw new CliError(`只支持 upload 子命令，收到：${argv[0]}`)

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      config: { type: 'string' },
      version: { type: 'string' },
      platform: { type: 'string' },
      arch: { type: 'string' },
      file: { type: 'string' },
      blockmap: { type: 'string' },
      'sig-file': { type: 'string' },
      replace: { type: 'boolean' },
      multipart: { type: 'string' }
    },
    strict: true,
    allowPositionals: false
  })

  for (const key of ['version', 'platform', 'file']) {
    if (!values[key]) throw new CliError(`缺少必填参数 --${key}`)
  }

  const stat = await fs.stat(values.file).catch(() => null)
  if (!stat?.isFile()) throw new CliError(`安装包文件不存在：${values.file}`)

  const mode = resolveMultipartMode(values.multipart)
  const thresholdBytes = readPositiveIntegerEnv(
    'APPHUB_MULTIPART_THRESHOLD_BYTES',
    MULTIPART_DEFAULTS.thresholdBytes,
    { allowZero: true }
  )
  if (mode === 'off' || !shouldUseMultipart(stat.size, { thresholdBytes })) {
    process.exitCode = delegateToApphub(values)
    return
  }

  const config = await loadConfig(values.config)
  const credentials = resolveCredentials(config)
  const client = new ApphubClient({
    baseUrl: config.baseUrl,
    appKey: config.appKey,
    credentials
  })
  await client.login()
  ok(`登录成功：${config.baseUrl}（账号 ${credentials.username}）`)

  await uploadLargePackage({ client, config, values, stat })
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    const message =
      error instanceof CliError
        ? `${error.message}${error.code ? `（code ${error.code}）` : ''}`
        : error instanceof Error
          ? error.message
          : String(error)
    console.error(`✗ ${message}`)
    process.exitCode = 1
  })
}
