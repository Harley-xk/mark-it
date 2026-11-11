import { app, BrowserWindow, net } from 'electron'
import type { WebContents } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { UpdateChannel, UpdateState } from '../shared/update-types'
import {
  channelFileName,
  channelOfVersion,
  compareVersions,
  isRollbackStartAllowed,
  isRollbackTarget,
  parseChannelVersion,
  selectUpdateCandidate
} from './update-channel'
import { registerHandle, registerOn } from './ipc-guard'
import { isSettingsWindowSender } from './settings-window'
import { activateWindow, resolveWindowPlacement } from './window-placement'

/**
 * apphub 应用管理平台更新通道。
 * appKey 可随客户端公开分发（平台文档：更新检测零密钥，仅凭 appKey 识别应用）。
 * electron-updater 按 generic provider 协议拉取 `latest*.yml`；
 * stable 为正式版，beta 为预发布版，检测范围由用户偏好决定。
 */
const APPHUB_BASE_URL = 'https://appcenter.witice.top'
const APPHUB_APP_KEY = 'ah_q100pquj6kxxj9at'
const FEED_URLS: Record<UpdateChannel, string> = {
  stable: `${APPHUB_BASE_URL}/api/update/${APPHUB_APP_KEY}/stable/electron`,
  beta: `${APPHUB_BASE_URL}/api/update/${APPHUB_APP_KEY}/beta/electron`
}
const ALL_CHANNELS: UpdateChannel[] = ['stable', 'beta']
/** 双通道元数据探测超时；超时按该通道不可达处理 */
const PEEK_TIMEOUT_MS = 10_000
const PREFERENCE_FILE_NAME = 'update-preference.json'

const FORCE_MARK = '[force]'

/** 周期检测间隔，默认 4 小时；可用 MARKIT_UPDATE_CHECK_INTERVAL_MS 覆盖（便于手工验证） */
const DEFAULT_PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const configuredCheckInterval = Number(process.env['MARKIT_UPDATE_CHECK_INTERVAL_MS'])
const PERIODIC_CHECK_INTERVAL_MS =
  Number.isFinite(configuredCheckInterval) && configuredCheckInterval > 0
    ? configuredCheckInterval
    : DEFAULT_PERIODIC_CHECK_INTERVAL_MS

interface ReleaseNotesItem {
  version: string
  note?: string | null
}

/** 平台约定：强制更新版本在 releaseNotes 首行前置 `[force]`，展示前剔除 */
function extractReleaseNotes(info: UpdateInfo): { notes: string; forceUpdate: boolean } {
  let notes = ''
  if (typeof info.releaseNotes === 'string') {
    notes = info.releaseNotes
  } else if (Array.isArray(info.releaseNotes)) {
    notes = (info.releaseNotes as ReleaseNotesItem[])
      .map((item) => `v${item.version}${item.note ? `\n${item.note}` : ''}`)
      .join('\n\n')
  }

  let forceUpdate = false
  if (notes.startsWith(FORCE_MARK)) {
    forceUpdate = true
    notes = notes.slice(FORCE_MARK.length).replace(/^\r?\n/, '')
  }
  return { notes: notes.trim(), forceUpdate }
}

let state: UpdateState = {
  status: 'idle',
  currentVersion: '0.0.0',
  currentChannel: 'stable',
  betaUpdatesEnabled: false,
  forceUpdate: false
}

let initialized = false
let beforeInstall: (() => void) | null = null
let onInstallFailed: (() => void) | null = null
let isEditorWindowSender: ((contents: WebContents) => boolean) | null = null
let requestInstall: (() => Promise<boolean>) | null = null
/** 更新详情窗口（唯一实例，重复打开时聚焦已有窗口） */
let updateWindow: BrowserWindow | null = null
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null
let installRequestInProgress = false
/** 当前 feed 指向的通道，用于给 update-available 的结果标注来源 */
let activeCheckChannel: UpdateChannel = 'stable'
/** 检测过程中用户切换了 Beta 偏好：本次检测结束后按新偏好再检测一次 */
let recheckPending = false
/** 正在下载：切换偏好时不打断已开始的下载 */
let downloading = false
/** 本次检测由一次性回退发起，update-available 据此标注回退并自动下载 */
let rollbackPending = false
/** 回退流程进行中：阻止周期检测、普通检测与 Beta 开关干扰 */
let rollbacking = false
/** 偏好文件路径，首次使用时按 userData 计算（init 在 app ready 之后） */
let preferenceFile = ''

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  broadcast()
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:state', state)
  }
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  // 平台未发布任何版本时 electron 端点返回 404，按「无更新」容错
  return message.includes('404') || message.toLowerCase().includes('cannot find latest')
}

function getPreferenceFile(): string {
  if (!preferenceFile) preferenceFile = join(app.getPath('userData'), PREFERENCE_FILE_NAME)
  return preferenceFile
}

/** 读取 Beta 偏好；文件不存在（首次启动）或损坏时按关闭处理 */
function loadBetaPreference(): boolean {
  const file = getPreferenceFile()
  if (!existsSync(file)) return false
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { betaUpdatesEnabled?: unknown }
    return parsed.betaUpdatesEnabled === true
  } catch (error) {
    console.warn('Failed to load update preference:', error)
    return false
  }
}

async function saveBetaPreference(enabled: boolean): Promise<void> {
  try {
    await writeFile(getPreferenceFile(), JSON.stringify({ betaUpdatesEnabled: enabled }), 'utf-8')
  } catch (error) {
    console.error('Failed to save update preference:', error)
  }
}

function setFeed(channel: UpdateChannel): void {
  activeCheckChannel = channel
  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URLS[channel] })
}

interface ChannelPeek {
  channel: UpdateChannel
  version: string | null
  reachable: boolean
}

/**
 * 读取单个通道的元数据（与 electron-updater 读取的是同一份 latest*.yml），
 * 只取顶层 version 用于选通道。404 表示通道暂无发布，属于正常状态。
 */
async function peekChannel(channel: UpdateChannel): Promise<ChannelPeek> {
  const url = `${FEED_URLS[channel]}/${channelFileName(process.platform)}?noCache=${Date.now()}`
  try {
    const response = await net.fetch(url, { signal: AbortSignal.timeout(PEEK_TIMEOUT_MS) })
    if (response.status === 404) return { channel, version: null, reachable: true }
    if (!response.ok) {
      console.warn('Failed to fetch update metadata:', channel, response.status)
      return { channel, version: null, reachable: false }
    }
    const version = parseChannelVersion(await response.text())
    if (!version) console.warn('Failed to parse update metadata:', channel, url)
    return { channel, version, reachable: true }
  } catch (error) {
    console.warn('Failed to fetch update metadata:', channel, error)
    return { channel, version: null, reachable: false }
  }
}

function channelsToCheck(): UpdateChannel[] {
  return state.betaUpdatesEnabled ? ALL_CHANNELS : ['stable']
}

/** 退出回退运行态，并确保 electron-updater 不会长期保留降级许可 */
function clearRollbackMode(): void {
  rollbackPending = false
  rollbacking = false
  autoUpdater.allowDowngrade = false
}

function failRollback(message: string, isRollback = true): UpdateState {
  clearRollbackMode()
  setState({
    status: 'error',
    error: message,
    progress: undefined,
    isRollback
  })
  return state
}

/**
 * 双通道检测：取两个通道中大于当前版本的最高版本，再让 electron-updater
 * 对该通道执行正式检测。只开单通道时保持原有的单 feed 行为。
 */
async function checkForUpdates(): Promise<UpdateState> {
  if (state.status === 'disabled') return state
  if (state.status === 'checking' || state.status === 'downloading') return state
  if (rollbacking) return state

  clearRollbackMode()
  setState({
    status: 'checking',
    error: undefined,
    progress: undefined,
    isRollback: false
  })

  const channels = channelsToCheck()
  let targetChannel: UpdateChannel = channels[0] ?? 'stable'

  if (channels.length > 1) {
    const peeks = await Promise.all(channels.map((channel) => peekChannel(channel)))
    const candidates = peeks
      .filter((peek): peek is ChannelPeek & { version: string } => peek.version !== null)
      .map((peek) => ({ channel: peek.channel, version: peek.version }))
    const candidate = selectUpdateCandidate(candidates, state.currentVersion)
    if (!candidate) {
      if (!peeks.some((peek) => peek.reachable)) {
        setState({ status: 'error', error: '无法获取更新信息' })
      } else {
        setState({
          status: 'not-available',
          latestVersion: undefined,
          latestChannel: undefined,
          notes: undefined,
          forceUpdate: false
        })
      }
      finishCheck()
      return state
    }
    targetChannel = candidate.channel
  }

  try {
    setFeed(targetChannel)
    await autoUpdater.checkForUpdates()
  } catch (error) {
    if (isNotFoundError(error)) {
      setState({ status: 'not-available', error: undefined })
    } else {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }
  finishCheck()
  return state
}

/** 检测期间用户切换了偏好：结束后按新偏好补一次检测；正在下载则不打断 */
function finishCheck(): void {
  if (!recheckPending) return
  recheckPending = false
  if (downloading || state.status === 'downloading' || state.status === 'downloaded') return
  void checkForUpdates()
}

/**
 * 切换「接收 Beta 版更新」。
 * - 检测中：等本次检测结束后按新偏好补检一次；
 * - 下载中 / 已下载：不打断，下一次检测按新偏好执行；
 * - 其余状态：清除旧提示并立即重新检测。
 */
async function setBetaEnabled(enabled: boolean): Promise<UpdateState> {
  if (rollbacking) return state
  if (state.betaUpdatesEnabled === enabled) return state
  state = { ...state, betaUpdatesEnabled: enabled }
  await saveBetaPreference(enabled)
  broadcast()

  if (state.status === 'disabled') return state
  if (state.status === 'checking') {
    recheckPending = true
    return state
  }
  if (downloading || state.status === 'downloading' || state.status === 'downloaded') return state

  setState({
    status: 'idle',
    latestVersion: undefined,
    latestChannel: undefined,
    notes: undefined,
    forceUpdate: false,
    error: undefined,
    progress: undefined,
    isRollback: false
  })
  return checkForUpdates()
}

/**
 * 用户主动发起的一次性回退：只检测 stable 当前最新版本，并在开始下载前退出 Beta。
 * 预检失败不改变 Beta 开关；成功后才临时允许 electron-updater 降级。
 */
async function rollbackToStable(): Promise<UpdateState> {
  if (rollbacking) return state
  if (!isRollbackStartAllowed(state.status)) return state

  if (state.currentChannel !== 'beta') {
    setState({ status: 'error', error: '当前不是 Beta 版本', isRollback: false })
    return state
  }
  if (process.platform === 'darwin') {
    setState({
      status: 'error',
      error: '当前平台不支持自动回退，请手动安装正式版',
      isRollback: false
    })
    return state
  }

  clearRollbackMode()
  recheckPending = false
  rollbacking = true
  setState({
    status: 'checking',
    latestVersion: undefined,
    latestChannel: undefined,
    notes: undefined,
    forceUpdate: false,
    progress: undefined,
    error: undefined,
    isRollback: true
  })

  const stable = await peekChannel('stable')
  if (!stable.reachable) return failRollback('无法获取正式版信息')
  if (!stable.version) return failRollback('正式版通道暂无可用版本')
  if (!isRollbackTarget(state.currentVersion, stable.version)) {
    const sameVersion = compareVersions(stable.version, state.currentVersion) === 0
    return failRollback(
      sameVersion ? '已是最新正式版' : '正式版版本高于当前版本，请直接检查更新',
      false
    )
  }

  // 预检通过后才真正退出 Beta；后续任何失败都保持关闭，避免下一次检测又推回 Beta。
  state = { ...state, betaUpdatesEnabled: false }
  await saveBetaPreference(false)
  broadcast()
  rollbackPending = true
  autoUpdater.allowDowngrade = true

  try {
    setFeed('stable')
    await autoUpdater.checkForUpdates()
  } catch (error) {
    return failRollback(error instanceof Error ? error.message : String(error))
  }

  if (rollbackPending) {
    return failRollback('正式版通道未返回可回退版本')
  }
  return state
}

/**
 * 周期检测：跳过进行中的检查 / 下载，以及已发现新版本或已下载完成的状态，
 * 避免自动检测打断用户正在处理（或等待安装）的更新。
 */
function periodicCheck(): void {
  if (rollbacking) return
  if (
    state.status === 'checking' ||
    state.status === 'downloading' ||
    state.status === 'downloaded' ||
    state.status === 'available'
  ) {
    return
  }
  void checkForUpdates()
}

async function downloadUpdate(): Promise<UpdateState> {
  if (state.status === 'checking' || state.status === 'downloading') return state
  if (state.status !== 'available' && state.status !== 'error') return state
  // 回退失败后必须重新预检 stable，不能直接复用旧的 updateInfo 下载
  if (state.isRollback && state.status === 'error' && !rollbacking) return state
  // 检测与下载紧邻发生，下载地址仍在平台 2h 有效期内；失败重试会重新走下载
  downloading = true
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (state.isRollback) {
      failRollback(message)
    } else {
      setState({ status: 'error', error: message })
    }
  } finally {
    downloading = false
  }
  return state
}

function installUpdate(): boolean {
  if (state.status !== 'downloaded') return false
  // 应用侧关闭守卫会阻止窗口关闭；安装前放行，避免安装器卡住
  beforeInstall?.()
  try {
    autoUpdater.quitAndInstall(false, true)
    return true
  } catch (error) {
    // 安装启动失败：撤销放行标志并把错误回传给两个窗口，避免静默无反应
    onInstallFailed?.()
    const message = error instanceof Error ? error.message : String(error)
    const wasRollback = state.isRollback === true
    clearRollbackMode()
    console.error('Failed to install update:', error)
    setState({ status: 'error', error: `安装失败：${message}`, isRollback: wasRollback })
    return false
  }
}

function isUpdateWindowSender(contents: WebContents): boolean {
  return !!updateWindow && !updateWindow.isDestroyed() && updateWindow.webContents === contents
}

/** 打开（或聚焦）独立的更新详情窗口 */
function openUpdateWindow(sourceWindow?: BrowserWindow | null): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    activateWindow(updateWindow)
    return
  }

  const placement = resolveWindowPlacement(sourceWindow, {
    width: 560,
    height: 680,
    minWidth: 460,
    minHeight: 520
  })
  updateWindow = new BrowserWindow({
    ...placement,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1c1c27',
    title: 'MarkIt 更新',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  updateWindow.once('ready-to-show', () => activateWindow(updateWindow))
  updateWindow.on('closed', () => {
    updateWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    updateWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/update.html`)
  } else {
    updateWindow.loadFile(join(__dirname, '../renderer/update.html'))
  }
}

/** 所有编辑窗口关闭后，关闭全局更新详情工具窗口 */
export function closeUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close()
}

async function requestInstallFromWindow(): Promise<boolean> {
  if (state.status !== 'downloaded' || installRequestInProgress) return false
  installRequestInProgress = true
  try {
    const prepared = (await requestInstall?.()) ?? false
    if (!prepared) return false
    return installUpdate()
  } finally {
    installRequestInProgress = false
  }
}

function bindEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    // 手动检测时 setState 已置 checking；此处兜底自动检测场景
    if (state.status !== 'checking') setState({ status: 'checking', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    const { notes, forceUpdate } = extractReleaseNotes(info)
    if (rollbackPending && isRollbackTarget(state.currentVersion, info.version)) {
      rollbackPending = false
      setState({
        status: 'available',
        latestVersion: info.version,
        latestChannel: 'stable',
        isRollback: true,
        notes,
        forceUpdate: false,
        progress: undefined,
        error: undefined
      })
      // 回退已由用户确认，直接进入下载；不沿用正式版的强制更新标记
      void downloadUpdate()
      return
    }

    // 预检后远端元数据发生变化：按普通更新处理，并立即复位一次性的降级许可
    if (rollbackPending) clearRollbackMode()
    setState({
      status: 'available',
      latestVersion: info.version,
      latestChannel: activeCheckChannel,
      isRollback: false,
      notes,
      forceUpdate,
      progress: undefined,
      error: undefined
    })
    // 强制更新直接开始下载，用户只能选择「立即安装」
    if (forceUpdate) void downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    if (rollbacking || rollbackPending) {
      failRollback('未找到可回退的正式版')
      return
    }
    setState({
      status: 'not-available',
      latestVersion: undefined,
      latestChannel: undefined,
      isRollback: false,
      notes: undefined,
      forceUpdate: false
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      status: 'downloading',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({
      status: 'downloaded',
      latestVersion: info.version,
      progress: undefined,
      error: undefined
    })
  })

  autoUpdater.on('error', (error) => {
    // 已进入安装流程后失败：撤销放行标志，避免后续关窗绕过未保存确认
    const wasInstalling = state.status === 'downloaded'
    const wasRollback = rollbacking || rollbackPending || state.isRollback === true
    if (wasRollback) {
      failRollback(error?.message ?? String(error))
    } else if (isNotFoundError(error)) {
      setState({ status: 'not-available', error: undefined })
    } else {
      setState({ status: 'error', error: error?.message ?? String(error) })
    }
    if (wasInstalling) onInstallFailed?.()
  })
}

/**
 * 初始化自动更新：配置 feed、注册 IPC、启动后静默检测一次。
 * 必须在 app ready 之后调用。
 */
export function initAutoUpdater(
  options: {
    isEditorWindowSender?: (contents: WebContents) => boolean
    requestInstall?: () => Promise<boolean>
    beforeInstall?: () => void
    onInstallFailed?: () => void
  } = {}
): void {
  if (initialized) return
  initialized = true
  beforeInstall = options.beforeInstall ?? null
  onInstallFailed = options.onInstallFailed ?? null
  isEditorWindowSender = options.isEditorWindowSender ?? null
  requestInstall = options.requestInstall ?? null

  const currentVersion = app.getVersion()
  state = {
    ...state,
    currentVersion,
    currentChannel: channelOfVersion(currentVersion),
    betaUpdatesEnabled: loadBetaPreference(),
    status: is.dev ? 'disabled' : 'idle'
  }

  // 初始 feed 固定为 stable；每次检测会按偏好与候选结果重设
  setFeed('stable')
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  bindEvents()

  registerHandle('update:get-state', () => state)
  registerHandle('update:check', () => checkForUpdates())
  registerHandle('update:download', () => downloadUpdate())
  registerHandle('update:set-beta-enabled', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return state
    return setBetaEnabled(enabled)
  })
  registerHandle('update:rollback-to-stable', (event) => {
    if (!isEditorWindowSender?.(event.sender) && !isSettingsWindowSender(event.sender)) {
      return state
    }
    return rollbackToStable()
  })
  // 所有安装入口都由主进程统一协调所有编辑窗口，避免绕过未保存确认。
  registerHandle('update:install', (event) => {
    const allowed =
      isEditorWindowSender?.(event.sender) ||
      isSettingsWindowSender(event.sender) ||
      isUpdateWindowSender(event.sender)
    return allowed ? requestInstallFromWindow() : false
  })
  registerHandle('update:open-window', (event) => {
    openUpdateWindow(BrowserWindow.fromWebContents(event.sender))
  })
  // 更新窗口自己的关闭按钮：只接受更新详情窗口，其他窗口调用直接忽略。
  registerOn('update:close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !isUpdateWindowSender(event.sender)) return
    win.close()
  })
  registerHandle('update:request-install', (event) => {
    const allowed =
      isEditorWindowSender?.(event.sender) ||
      isSettingsWindowSender(event.sender) ||
      isUpdateWindowSender(event.sender)
    return allowed ? requestInstallFromWindow() : false
  })

  if (!is.dev) {
    // 启动后延迟静默检测，避免与首屏渲染 / 文件加载抢资源
    setTimeout(() => void checkForUpdates(), 3000)
    // 长期运行的应用也要周期检测，避免客户端停留在旧版本
    periodicCheckTimer = setInterval(periodicCheck, PERIODIC_CHECK_INTERVAL_MS)
    app.once('before-quit', () => {
      if (periodicCheckTimer) {
        clearInterval(periodicCheckTimer)
        periodicCheckTimer = null
      }
    })
  }
}
