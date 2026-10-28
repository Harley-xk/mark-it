#!/usr/bin/env node
/*
 * 作者: Harley-xk
 * 创建: 2026-10-19
 *
 * 描述: apphub 发版 CLI：登录管理端 / 版本创建与维护 / STS 直传 OSS 上传登记 / 发布与更新检测验证 / 技能自更新（零第三方依赖，Node ≥ 18）
 * 设计依据: docs/应用管理平台/发版Skill设计.md（K1~K7）
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createReadStream, realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/* ---------------------------------- 出错与输出 ---------------------------------- */

class CliError extends Error {
  /** 业务错误码（九位分段码或 HTTP 401 / 429），无则为 undefined */
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function fail(message, code) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function ok(message) {
  console.log(`✓ ${message}`)
}

/* ---------------------------------- 配置加载 ---------------------------------- */

const DEFAULT_CONFIG_FILE = '.apphub-release.json'

async function loadConfig(explicitPath) {
  const file = explicitPath ?? DEFAULT_CONFIG_FILE
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  }
  catch {
    fail(`配置文件不存在：${path.resolve(file)}。首次接入请在 agent 引导下生成（见 SKILL.md「首次接入」）`)
  }
  let config
  try {
    config = JSON.parse(raw)
  }
  catch (error) {
    fail(`配置文件不是合法 JSON：${file}（${error.message}）`)
  }
  for (const key of ['baseUrl', 'appKey']) {
    if (!config[key])
      fail(`配置文件缺必填项 ${key}：${file}`)
  }
  if (!config.channel)
    config.channel = 'stable'
  return config
}

/** 凭据解析：环境变量优先，配置 credentials 节兜底（K6 双通道） */
function resolveCredentials(config) {
  const credentials = config.credentials ?? {}
  const username = process.env.APPHUB_USERNAME ?? credentials.username
  const password = process.env.APPHUB_PASSWORD ?? credentials.password
  const signSecret = process.env.APPHUB_SIGN_SECRET ?? credentials.signSecret
  if (!username || !password)
    fail('缺少发版账号凭据：请设置环境变量 APPHUB_USERNAME / APPHUB_PASSWORD，或在配置文件 credentials 节填写（该文件须加入 .gitignore）')
  return { username, password, signSecret }
}

/* ---------------------------------- 技能自更新 ---------------------------------- */

const DEFAULT_BASE_URL = 'https://appcenter.witice.top'
const SKILL_NAME = 'apphub-release'
/** skill 根目录：脚本固定位于 <skill>/scripts/apphub.mjs */
const SKILL_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readLocalSkillVersion() {
  try {
    return (await fs.readFile(path.join(SKILL_ROOT_DIR, 'VERSION'), 'utf8')).trim() || null
  }
  catch {
    return null
  }
}

/** 基址优先级：--base-url > 配置 baseUrl > 线上默认（首次接入前无配置也能自检；私有化部署须显式指定） */
async function resolveSkillBaseUrl(explicit, configPath) {
  if (explicit)
    return explicit.replace(/\/+$/, '')
  try {
    const raw = await fs.readFile(configPath ?? DEFAULT_CONFIG_FILE, 'utf8')
    const baseUrl = JSON.parse(raw).baseUrl
    if (baseUrl)
      return String(baseUrl).replace(/\/+$/, '')
  }
  catch {}
  return DEFAULT_BASE_URL
}

/** 通用下载（支持 http/https 与最多 3 次重定向，30s 超时） */
function fetchBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const request = client.get(url, { headers: { 'User-Agent': `${SKILL_NAME}-skill` } }, (response) => {
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location && redirects > 0) {
        response.resume()
        resolve(fetchBuffer(new URL(response.headers.location, url).href, redirects - 1))
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new CliError(`下载失败 HTTP ${status}：${url}`))
        return
      }
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.setTimeout(30_000, () => request.destroy(new Error('下载超时（30s）')))
  })
}

/** 分发文件路径白名单：只允许 skill 根下 SKILL.md / VERSION / scripts/**，拒绝越权与路径穿越 */
function assertSkillPath(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || path.isAbsolute(rel))
    throw new CliError(`manifest 文件路径非法：${String(rel)}`)
  const normalized = path.posix.normalize(rel)
  if (normalized !== rel || normalized.startsWith('..'))
    throw new CliError(`manifest 文件路径非法：${rel}`)
  if (!(normalized === 'SKILL.md' || normalized === 'VERSION' || normalized.startsWith('scripts/')))
    throw new CliError(`manifest 含不允许分发的文件：${rel}`)
}

/**
 * 自检 / 更新 skill 本体（设计见 docs/应用管理平台/发版Skill设计.md K8）。
 * - --check：只比对版本，不动文件；更新源不可达时仅告警，不阻断发版
 * - 默认：下载 manifest 列出的文件 → sha256 校验 → 逐个原子替换 → 失败回滚
 * 不依赖配置文件与登录：未接入应用也能先更新技能
 */
async function cmdSelfUpdate(args) {
  const checkOnly = Boolean(args.values.check)
  const current = await readLocalSkillVersion()
  const baseUrl = await resolveSkillBaseUrl(args.values['base-url'], args.values.config)
  const manifestUrl = `${baseUrl}/api/skill/${SKILL_NAME}/manifest`

  let manifest
  try {
    manifest = JSON.parse((await fetchBuffer(manifestUrl)).toString('utf8'))
  }
  catch (error) {
    const message = `无法获取技能更新源（${manifestUrl}）：${error instanceof Error ? error.message : String(error)}`
    if (checkOnly) {
      console.log(`⚠ ${message}`)
      console.log(`  继续使用本地版本 ${current ?? '未知'}（自检失败不阻断发版）`)
      return
    }
    fail(message)
  }
  if (manifest?.name !== SKILL_NAME || typeof manifest.version !== 'string' || !Array.isArray(manifest.files))
    fail('更新源 manifest 格式非法（缺少 name / version / files）')

  if (!current) {
    console.log(`⚠ 本地缺少 VERSION 文件，按需要更新处理（远端 ${manifest.version}）`)
  }
  else if (compareSemver(current, manifest.version) >= 0) {
    ok(`技能已是最新：${current}`)
    return
  }
  else {
    ok(`发现技能新版本：${current} → ${manifest.version}`)
  }

  if (checkOnly) {
    console.log('  执行 `node scripts/apphub.mjs self-update` 更新（CLI 即时生效；SKILL.md 下次调用 / 新会话生效）')
    return
  }

  // 先全部下载并校验，再逐个替换；任一失败回滚已替换文件
  const staging = path.join(SKILL_ROOT_DIR, `.update-${process.pid}`)
  try {
    await fs.rm(staging, { recursive: true, force: true })
    await fs.mkdir(staging, { recursive: true })

    for (const file of manifest.files) {
      assertSkillPath(file.path)
      if (typeof file.sha256 !== 'string' || file.sha256.length !== 64)
        throw new CliError(`manifest 文件缺少合法 sha256：${file.path}`)
      const fileUrl = typeof file.url === 'string'
        ? `${baseUrl}${file.url}`
        : `${baseUrl}/api/skill/${SKILL_NAME}/files/${manifest.version}/${file.path}`
      const content = await fetchBuffer(fileUrl)
      const digest = createHash('sha256').update(content).digest('hex')
      if (digest !== file.sha256)
        throw new CliError(`文件校验失败（sha256 不匹配）：${file.path}`)
      const dest = path.join(staging, file.path)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, content)
    }

    const applied = []
    try {
      for (const file of manifest.files) {
        const target = path.join(SKILL_ROOT_DIR, file.path)
        const source = path.join(staging, file.path)
        const backup = path.join(staging, `${file.path}.old`)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.mkdir(path.dirname(backup), { recursive: true })
        let hadOld = false
        try {
          await fs.rename(target, backup)
          hadOld = true
        }
        catch {}
        try {
          await fs.rename(source, target)
        }
        catch (error) {
          if (hadOld)
            await fs.rename(backup, target).catch(() => {})
          throw error
        }
        applied.push({ target, backup: hadOld ? backup : null })
      }
    }
    catch (error) {
      for (const item of applied.reverse()) {
        await fs.rm(item.target, { force: true }).catch(() => {})
        if (item.backup)
          await fs.rename(item.backup, item.target).catch(() => {})
      }
      throw error
    }

    const skillChanged = manifest.files.some(file => file.path === 'SKILL.md')
    ok(`技能已更新：${current ?? '未知'} → ${manifest.version}`)
    console.log(skillChanged
      ? '  CLI 已即时生效；SKILL.md 已更新，下次调用 / 新会话生效'
      : '  CLI 已即时生效')
  }
  catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    fail(`技能更新失败，已回滚：${error instanceof Error ? error.message : String(error)}`)
  }
  await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
}

/* ---------------------------------- API 客户端 ---------------------------------- */

/** 写方法签名头三件套（算法与平台《请求签名验证设计》§2.2 一致：五段 \n 连接 + HMAC-SHA256 小写 hex） */
function buildSignHeaders(method, pathname, bodyText, signSecret) {
  if (!signSecret)
    return {}
  const timestamp = String(Date.now())
  const noncestr = randomBytes(16).toString('hex')
  const signString = [method.toUpperCase(), pathname, bodyText, timestamp, noncestr].join('\n')
  const sign = createHmac('sha256', signSecret).update(signString).digest('hex')
  return { sign, timestamp, noncestr }
}

class ApphubClient {
  constructor({ baseUrl, appKey, credentials }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.appKey = appKey
    this.credentials = credentials
    this.token = null
  }

  /** 登录换取 JWT（双豁免接口，无需签名）；单命令生命周期内持有（有效期 8h） */
  async login() {
    const data = await this.request('POST', '/system/auth/login', {
      body: { username: this.credentials.username, password: this.credentials.password },
      open: true,
    })
    this.token = data.token
    return data.token
  }

  /**
   * 统一请求：路径为不含 /api 前缀的 pathname（如 /appcenter/app）
   * - open 接口（登录 / 更新检测）不带 Authorization 与签名
   * - 写方法在配置签名密钥时自动注入三件套头；签的 = 发的（同一 bodyText 本体发送）
   */
  async request(method, apiPath, { body, query, open = false } = {}) {
    const pathname = `/api${apiPath}`
    let url = `${this.baseUrl}${pathname}`
    if (query) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null)
          search.set(key, String(value))
      }
      const qs = search.toString()
      if (qs)
        url += `?${qs}`
    }

    const bodyText = body === undefined ? '' : JSON.stringify(body)
    const headers = {}
    if (body !== undefined)
      headers['Content-Type'] = 'application/json'
    if (!open) {
      headers.Authorization = `Bearer ${this.token}`
      // GET 不签名（标准方案仅写方法校验），签名头只在写方法注入
      if (method !== 'GET')
        Object.assign(headers, buildSignHeaders(method, pathname, bodyText, this.credentials.signSecret))
    }
    else if (this.appKey) {
      // 开放接口（更新检测）以 X-App-Key 头标识应用（登录接口多带无害）
      headers['X-App-Key'] = this.appKey
    }

    let response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : bodyText,
        signal: AbortSignal.timeout(30_000),
      })
    }
    catch (error) {
      throw new CliError(`请求平台失败（${url}）：${error.message}`)
    }

    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    }
    catch {
      // 非 JSON 响应（网关错误页等）
    }
    if (!response.ok || !payload || payload.code !== 0) {
      const code = payload?.code ?? response.status
      const message = payload?.message ?? `HTTP ${response.status}`
      if (code === 401 && !open)
        throw new CliError(`认证/签名失败（401）：${message}。排查：令牌过期则重登；平台开启签名时须配置 APPHUB_SIGN_SECRET`, code)
      throw new CliError(`平台返回错误 [${code}]：${message}`, code)
    }
    return payload.data
  }

  get(apiPath, query) {
    return this.request('GET', apiPath, { query })
  }
}

/** 分页接口全量拉取（每页 100） */
async function pageAll(client, apiPath, baseQuery = {}) {
  const rows = []
  let pageNo = 1
  for (;;) {
    const data = await client.get(apiPath, { ...baseQuery, pageNo, pageSize: 100 })
    rows.push(...(data.list ?? []))
    if (rows.length >= (data.total ?? 0) || (data.list ?? []).length === 0)
      return rows
    pageNo++
  }
}

/* ---------------------------------- 资源解析（appKey → 应用 → 通道 → 版本） ---------------------------------- */

async function resolveApp(client) {
  const apps = await pageAll(client, '/appcenter/app')
  const app = apps.find(item => item.appKey === client.appKey)
  if (!app)
    fail(`平台上未找到 appKey 为 ${client.appKey} 的应用（列表共 ${apps.length} 个），请核对配置`)
  return app
}

async function resolveChannel(client, appId, channelCode) {
  const channels = await client.get(`/appcenter/app/${appId}/channel`)
  const channel = channels.find(item => item.code === channelCode)
  if (!channel)
    fail(`应用未配置通道 ${channelCode}（现有：${channels.map(item => item.code).join('、') || '无'}）`)
  return channel
}

async function findVersion(client, appId, channelId, version) {
  const rows = await pageAll(client, `/appcenter/app/${appId}/version`, { channelId })
  return rows.find(item => item.version === version) ?? null
}

/** 加载版本并校验处于期望状态（draft / published，状态机约束见平台设计 §3.2） */
async function requireVersion(client, appId, channel, version, expectedStatus, actionLabel) {
  const record = await findVersion(client, appId, channel.id, version)
  if (!record)
    fail(`通道 ${channel.code} 下不存在版本 ${version}，请先 create-version（${actionLabel}）`)
  // expectedStatus 支持单值或数组（平台包维护同时允许 draft / published，offline 冻结）
  const expected = expectedStatus ? (Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]) : []
  if (expected.length > 0 && !expected.includes(record.status))
    fail(`版本 ${version} 当前状态为 ${record.status}，${actionLabel}要求 ${expected.join(' / ')}（状态机约束，见平台设计 §3.2）`)
  return record
}

/* ---------------------------------- semver 简易比较（展示「最新版本」用） ---------------------------------- */

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value ?? '')
  if (!match)
    return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? '' }
}

/** 比较两个 semver：a < b 返回 -1；无法解析视为最小；同版本预发布 < 正式版 */
function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb)
    return 0
  if (!pa)
    return -1
  if (!pb)
    return 1
  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key])
      return pa[key] < pb[key] ? -1 : 1
  }
  if (pa.pre === pb.pre)
    return 0
  if (!pa.pre)
    return 1
  if (!pb.pre)
    return -1
  return pa.pre < pb.pre ? -1 : 1
}

/* ---------------------------------- 文件哈希（流式，不整读内存） ---------------------------------- */

async function hashFile(filePath) {
  const h256 = createHash('sha256')
  const h512 = createHash('sha512')
  for await (const chunk of createReadStream(filePath)) {
    h256.update(chunk)
    h512.update(chunk)
  }
  return { sha256: h256.digest('hex'), sha512: h512.digest('base64') }
}

/* ---------------------------------- OSS PutObject（STS 凭证，HMAC-SHA1 Header 签名，https 流式） ---------------------------------- */

/** 从 OSS XML 错误体提取 Code / Message */
function describeOssError(buffer) {
  const text = buffer.toString('utf8')
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
  const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1]
  return code ? `${code}: ${message ?? ''}` : text.slice(0, 200) || '（空响应体）'
}

/**
 * STS 凭证直传单文件到 OSS 私有桶（与平台前端 ali-oss client.put 同语义）
 * 签名串：PUT\n<Content-MD5 空>\n<Content-Type 空>\nDate\nx-oss-security-token 头\n/{bucket}/{objectKey}
 * 注意：CanonicalizedResource 用未编码原始键，请求路径按键内每段 URL 编码——两者不可混用
 */
function ossPutObject(credential, objectKey, filePath, fileSize) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString()
    const stringToSign = ['PUT', '', '', date, `x-oss-security-token:${credential.securityToken}\n/${credential.bucket}/${objectKey}`].join('\n')
    const signature = createHmac('sha1', credential.accessKeySecret).update(stringToSign).digest('base64')
    const host = `${credential.bucket}.${credential.region.includes('.') ? credential.region : `${credential.region}.aliyuncs.com`}`
    const encodedPath = objectKey.split('/').map(encodeURIComponent).join('/')
    const request = https.request(
      {
        hostname: host,
        path: `/${encodedPath}`,
        method: 'PUT',
        headers: {
          Date: date,
          'x-oss-security-token': credential.securityToken,
          Authorization: `OSS ${credential.accessKeyId}:${signature}`,
          'Content-Length': fileSize,
        },
      },
      (response) => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300)
            resolve()
          else
            reject(new CliError(`OSS 上传失败（HTTP ${response.statusCode}）：${describeOssError(Buffer.concat(chunks))}`))
        })
      },
    )
    request.on('error', error => reject(new CliError(`OSS 上传请求失败：${error.message}`)))
    createReadStream(filePath).pipe(request)
  })
}

/* ---------------------------------- 命令实现 ---------------------------------- */

async function cmdStatus(client, config) {
  const app = await resolveApp(client)
  ok(`应用匹配：${app.name}（appKey ${app.appKey}，framework=${app.framework ?? '未设置'}，状态 ${app.status}，id ${app.id}）`)
  const channels = await client.get(`/appcenter/app/${app.id}/channel`)
  const channelLines = []
  for (const channel of channels) {
    const versions = await pageAll(client, `/appcenter/app/${app.id}/version`, { channelId: channel.id })
    const published = versions.filter(item => item.status === 'published').map(item => item.version).sort(compareSemver).at(-1)
    const draft = versions.filter(item => item.status === 'draft').map(item => item.version).sort(compareSemver).at(-1)
    const parts = [`已发布 ${published ?? '无'}`]
    if (draft)
      parts.push(`草稿 ${draft}`)
    channelLines.push(`  - ${channel.code}${channel.code === config.channel ? '（配置默认）' : ''}：${parts.join('，')}，状态 ${channel.status}`)
  }
  console.log('通道清单：')
  console.log(channelLines.join('\n'))
}

async function cmdCreateVersion(client, config, args) {
  if (!parseSemver(args.values.version))
    fail(`版本号 ${args.values.version} 不符合 semver 格式（MAJOR.MINOR.PATCH，可选预发布后缀）`)
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const existing = await findVersion(client, app.id, channel.id, args.values.version)
  if (existing) {
    if (existing.status === 'draft') {
      ok(`通道 ${channel.code} 已存在 ${args.values.version} 草稿（id ${existing.id}），直接复用——可继续 upload 或补改信息`)
      return
    }
    fail(`通道 ${channel.code} 下版本 ${args.values.version} 状态为 ${existing.status}：已发布请递增版本号；已下线为终态须新建版本`)
  }
  const versionId = await client.request('POST', `/appcenter/app/${app.id}/version`, {
    body: {
      channelId: channel.id,
      version: args.values.version,
      title: args.values.title ?? `v${args.values.version}`,
      notes: args.values.notes,
      forceUpdate: args.values.force ?? false,
    },
  })
  ok(`草稿版本已创建：${channel.code} / ${args.values.version}（versionId ${versionId}），下一步逐平台 upload`)
}

async function cmdUpload(client, config, args) {
  const sigFile = args.values['sig-file']
  const { platform, arch, file, blockmap } = args.values
  const replaceExisting = Boolean(args.values.replace)
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile())
    fail(`安装包文件不存在：${file}`)

  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, config.channel)
  const version = await requireVersion(client, app.id, channel, args.values.version, ['draft', 'published'], '上传安装包')
  if (version.status === 'published' && replaceExisting) {
    console.log('  注意：替换只影响之后的新下载 / 新安装；版本号未变，已安装客户端不会自动更新。')
    console.log('        修复存量用户请发布新版本。')
  }

  ok(`计算哈希（流式）：${file}`)
  const hash = await hashFile(file)
  console.log(`  sha256 = ${hash.sha256}`)
  console.log(`  sha512 = ${hash.sha512}`)

  let minisignSignature
  if (sigFile) {
    minisignSignature = (await fs.readFile(sigFile, 'utf8')).trim()
    if (!minisignSignature)
      fail(`minisign 签名文件为空：${sigFile}`)
    ok(`已读取 minisign 签名：${sigFile}`)
  }

  let blockmapSha512
  let blockmapFileSize
  if (blockmap) {
    const blockmapStat = await fs.stat(blockmap).catch(() => null)
    if (!blockmapStat?.isFile())
      fail(`blockmap 文件不存在：${blockmap}`)
    const blockmapHash = await hashFile(blockmap)
    blockmapSha512 = blockmapHash.sha512
    blockmapFileSize = blockmapStat.size
  }

  const uploadBody = { platform, fileName: path.basename(file) }
  if (arch)
    uploadBody.arch = arch
  if (replaceExisting)
    uploadBody.replaceExisting = true
  const credential = await client.request('POST', `/appcenter/version/${version.id}/package/upload-token`, { body: uploadBody })
  ok(`STS 凭证已签发（${credential.region} / ${credential.bucket}，${new Date(credential.expiration).toLocaleString()} 过期）`)

  await ossPutObject(credential, credential.objectKey, file, stat.size)
  ok(`安装包已直传：${credential.objectKey}（${stat.size} 字节）`)
  if (blockmap) {
    await ossPutObject(credential, credential.blockmapObjectKey, blockmap, blockmapFileSize)
    ok(`blockmap 已直传：${credential.blockmapObjectKey}（${blockmapFileSize} 字节）`)
  }

  const registerBody = {
    platform,
    fileName: path.basename(file),
    objectKey: credential.objectKey,
    sha256: hash.sha256,
    sha512: hash.sha512,
  }
  if (arch)
    registerBody.arch = arch
  if (minisignSignature)
    registerBody.minisignSignature = minisignSignature
  if (blockmapSha512) {
    registerBody.blockmapSha512 = blockmapSha512
    registerBody.blockmapFileSize = blockmapFileSize
  }
  if (replaceExisting)
    registerBody.replaceExisting = true
  const packageId = await client.request('POST', `/appcenter/version/${version.id}/package`, { body: registerBody })
  ok(`包记录已${replaceExisting ? '替换' : '登记'}（packageId ${packageId}）：${platform}${arch ? `-${arch}` : ''} ← ${path.basename(file)}`)
}

async function cmdRemovePackage(client, config, args) {
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const version = await findVersion(client, app.id, channel.id, args.values.version)
  if (!version)
    fail(`通道 ${channel.code} 下不存在版本 ${args.values.version}`)
  const packages = await client.get(`/appcenter/version/${version.id}/package`)
  const target = packages.find(item => item.platform === args.values.platform && (item.arch ?? null) === (args.values.arch ?? null))
  if (!target)
    fail(`版本 ${args.values.version} 下没有 ${args.values.platform}${args.values.arch ? `-${args.values.arch}` : ''} 的包记录`)
  await client.request('DELETE', `/appcenter/version/${version.id}/package/${target.id}`)
  ok(`已删除包记录 ${target.fileName}（连带清理 OSS 对象；draft / published 可删，offline 冻结）`)
  if (version.status === 'published') {
    console.log('  注意：已发布版本删除包会撤回该平台分发——该平台回退到更早的有包版本，')
    console.log('        若无更早版本则新用户拿不到该版本；已安装客户端不受影响。')
  }
}

async function cmdPublish(client, config, args) {
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const version = await requireVersion(client, app.id, channel, args.values.version, 'draft', '发布')
  await client.request('POST', `/appcenter/version/${version.id}/publish`)
  ok(`版本已发布：${channel.code} / ${args.values.version}（客户端更新检测即刻可见）`)
}

async function cmdVerify(client, config, args) {
  const body = {
    platform: args.values.platform,
    channel: args.values.channel ?? config.channel,
  }
  if (args.values.arch)
    body.arch = args.values.arch
  if (args.values.current)
    body.currentVersion = args.values.current
  const data = await client.request('POST', '/open/app/version/check', { body, open: true })
  if (!data.hasUpdate || data.latestVersion !== args.values.expect) {
    fail(`更新检测未通过：hasUpdate=${data.hasUpdate}，latestVersion=${data.latestVersion ?? '无'}，期望 ${args.values.expect}（通道无发布版本 / 应用停用均表现为此形态）`)
  }
  ok(`更新检测验证通过：${data.latestVersion}（forceUpdate=${data.forceUpdate}，包 ${data.package ? data.package.fileName : '无（提示型平台）'}）`)
}

async function cmdUpdateVersion(client, config, args) {
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const version = await findVersion(client, app.id, channel.id, args.values.version)
  if (!version)
    fail(`通道 ${channel.code} 下不存在版本 ${args.values.version}`)
  const changes = { id: version.id }
  if (args.values.title !== undefined)
    changes.title = args.values.title
  if (args.values.notes !== undefined)
    changes.notes = args.values.notes
  if (args.values.force !== undefined) {
    if (!['true', 'false'].includes(args.values.force))
      fail('--force 取值须为 true / false')
    changes.forceUpdate = args.values.force === 'true'
  }
  if (Object.keys(changes).length === 1)
    fail('未指定任何变更项（--title / --notes / --force 至少其一）')
  await client.request('PUT', `/appcenter/version/${version.id}`, { body: changes })
  ok(`版本信息已更新：${channel.code} / ${args.values.version}（draft 全字段可改；published 仅更新说明与强制标记，服务端校验兜底）`)
}

async function cmdOffline(client, config, args) {
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const version = await requireVersion(client, app.id, channel, args.values.version, 'published', '下线')
  await client.request('POST', `/appcenter/version/${version.id}/offline`)
  ok(`版本已下线：${channel.code} / ${args.values.version}（终态不可回退；更新检测回退到次新已发布版本）`)
}

async function cmdDeleteVersion(client, config, args) {
  const app = await resolveApp(client)
  const channel = await resolveChannel(client, app.id, args.values.channel ?? config.channel)
  const version = await requireVersion(client, app.id, channel, args.values.version, 'draft', '删除')
  await client.request('DELETE', `/appcenter/version/${version.id}`)
  ok(`草稿版本已删除：${channel.code} / ${args.values.version}（连带清理包记录与 OSS 对象）`)
}

/* ---------------------------------- 参数定义与入口 ---------------------------------- */

const STRING = { type: 'string' }
const BOOLEAN = { type: 'boolean' }

const COMMANDS = {
  'self-update': {
    brief: '自检 / 更新 skill 本体（平台公开接口分发，无需登录）',
    options: {
      check: { ...BOOLEAN, help: '仅检查是否有新版本（更新源不可达时不阻断）' },
      yes: { ...BOOLEAN, help: '执行更新（CI 显式语义；默认可执行）' },
      'base-url': { ...STRING, help: '平台基址（缺省读配置，再缺省线上基址）' },
    },
    async run() {
      // main 对 self-update 单独短路（不加载配置 / 不登录），此分支不会被调用
    },
  },
  status: {
    brief: '连通自检：登录并展示应用 / 通道 / 各通道最新版本',
    options: {},
    async run(client, config, args) {
      await cmdStatus(client, config, args)
    },
  },
  'create-version': {
    brief: '建草稿版本（同版本 draft 幂等复用）',
    options: {
      version: { ...STRING, help: '版本号（semver，必填）' },
      title: { ...STRING, help: '版本标题（缺省 v{version}）' },
      notes: { ...STRING, help: '更新说明（多行文本）' },
      force: { ...BOOLEAN, help: '强制更新标记' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      if (!args.values.version)
        fail('缺少必填参数 --version')
      await cmdCreateVersion(client, config, args)
    },
  },
  upload: {
    brief: '单包上传全链：哈希 → STS → OSS 直传 → 登记包记录（draft / published）',
    options: {
      version: { ...STRING, help: '所属版本号（必填；draft / published，offline 冻结）' },
      platform: { ...STRING, help: 'windows / macos / linux / android（必填）' },
      arch: { ...STRING, help: 'x64 / arm64 / universal（桌面端必填）' },
      file: { ...STRING, help: '安装包文件路径（必填）' },
      blockmap: { ...STRING, help: 'blockmap 差分文件路径（electron 可选）' },
      'sig-file': { ...STRING, help: 'minisign 签名文件路径（tauri 必需）' },
      replace: { ...BOOLEAN, help: '替换已占用的平台槽位（已发布版本换包；仅影响新下载）' },
    },
    async run(client, config, args) {
      for (const key of ['version', 'platform', 'file']) {
        if (!args.values[key])
          fail(`缺少必填参数 --${key}`)
      }
      await cmdUpload(client, config, args)
    },
  },
  'remove-package': {
    brief: '删版本下的包记录（draft / published；published 删除即撤回该平台分发）',
    options: {
      version: { ...STRING, help: '版本号（必填）' },
      platform: { ...STRING, help: '平台（必填）' },
      arch: { ...STRING, help: '架构（未传匹配无架构包）' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      for (const key of ['version', 'platform']) {
        if (!args.values[key])
          fail(`缺少必填参数 --${key}`)
      }
      await cmdRemovePackage(client, config, args)
    },
  },
  publish: {
    brief: '发布版本（客户端立即可见，执行前须经用户确认）',
    options: {
      version: { ...STRING, help: '版本号（必填）' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      if (!args.values.version)
        fail('缺少必填参数 --version')
      await cmdPublish(client, config, args)
    },
  },
  verify: {
    brief: '调更新检测开放 API 断言版本已可见（免登录）',
    options: {
      expect: { ...STRING, help: '期望检测到的版本号（必填）' },
      platform: { ...STRING, help: '平台（必填）' },
      arch: { ...STRING, help: '架构' },
      current: { ...STRING, help: '模拟客户端当前版本（缺省视为首装必有更新）' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      for (const key of ['expect', 'platform']) {
        if (!args.values[key])
          fail(`缺少必填参数 --${key}`)
      }
      await cmdVerify(client, config, args)
    },
  },
  'update-version': {
    brief: '维护版本信息（标题 / 更新说明 / 强制标记）',
    options: {
      version: { ...STRING, help: '版本号（必填）' },
      title: { ...STRING, help: '新标题（仅 draft 可改）' },
      notes: { ...STRING, help: '新更新说明' },
      force: { ...STRING, help: '强制更新标记 true / false' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      if (!args.values.version)
        fail('缺少必填参数 --version')
      await cmdUpdateVersion(client, config, args)
    },
  },
  offline: {
    brief: '下线已发布版本（终态）',
    options: {
      version: { ...STRING, help: '版本号（必填）' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      if (!args.values.version)
        fail('缺少必填参数 --version')
      await cmdOffline(client, config, args)
    },
  },
  'delete-version': {
    brief: '删除草稿版本（连带清理包与 OSS 对象）',
    options: {
      version: { ...STRING, help: '版本号（必填）' },
      channel: { ...STRING, help: '通道 code（缺省取配置）' },
    },
    async run(client, config, args) {
      if (!args.values.version)
        fail('缺少必填参数 --version')
      await cmdDeleteVersion(client, config, args)
    },
  },
}

function printUsage() {
  console.log('apphub 发版 CLI（设计依据：docs/应用管理平台/发版Skill设计.md）')
  console.log('')
  console.log('用法：node apphub.mjs <子命令> [参数]  （全局：--config <配置文件路径>，默认 ./.apphub-release.json）')
  console.log('')
  console.log('子命令：')
  for (const [name, command] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(16)}${command.brief}`)
    for (const [flag, option] of Object.entries(command.options))
      console.log(`    --${flag.padEnd(12)}${option.help ?? ''}`)
  }
}

/** 供外部脚本复用的核心能力（CLI 入口守卫下不影响直接执行） */
export { ApphubClient, CliError, buildSignHeaders, compareSemver, hashFile, loadConfig, ossPutObject }

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printUsage()
    return
  }
  const name = argv[0]
  const command = COMMANDS[name]
  if (!command)
    fail(`未知子命令：${name}（--help 查看用法）`)

  let args
  try {
    args = parseArgs({
      args: argv.slice(1),
      options: { config: STRING, ...command.options },
      strict: true,
      allowPositionals: false,
    })
  }
  catch (error) {
    fail(`参数解析失败：${error.message}`)
  }

  // 自更新不依赖配置与登录（首次接入前即可用），在加载配置前短路
  if (name === 'self-update') {
    await cmdSelfUpdate(args)
    return
  }

  const config = await loadConfig(args.values.config)
  // verify 走开放 API 免登录免凭据；其余命令须先具备发版账号凭据并登录
  const credentials = name === 'verify' ? {} : resolveCredentials(config)
  const client = new ApphubClient({ baseUrl: config.baseUrl, appKey: config.appKey, credentials })
  if (name !== 'verify') {
    await client.login()
    ok(`登录成功：${config.baseUrl}（账号 ${credentials.username}）`)
  }
  await command.run(client, config, args)
}

/** 直接执行判定：realpath 归一，覆盖 /tmp 等符号链接目录（否则 CLI 会被静默跳过） */
function isDirectExecution() {
  if (!process.argv[1])
    return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  }
  catch {
    return false
  }
}

// 直接执行时进入 CLI；被 import 时不自动运行（冒烟 / 定制脚本复用客户端核心）
if (isDirectExecution()) {
  main().catch((error) => {
    fail(error instanceof CliError ? `${error.message}${error.code ? `（code ${error.code}）` : ''}` : error.stack ?? String(error))
  })
}
