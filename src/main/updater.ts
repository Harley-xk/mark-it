import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import type { UpdateState } from '../shared/update-types'

/**
 * apphub 应用管理平台更新通道。
 * appKey 可随客户端公开分发（平台文档：更新检测零密钥，仅凭 appKey 识别应用）。
 * electron-updater 按 generic provider 协议拉取 `latest.yml`（Windows x64）。
 */
const APPHUB_BASE_URL = 'https://appcenter.witice.top'
const APPHUB_APP_KEY = 'ah_q100pquj6kxxj9at'
const UPDATE_CHANNEL = 'stable'
const FEED_URL = `${APPHUB_BASE_URL}/api/update/${APPHUB_APP_KEY}/${UPDATE_CHANNEL}/electron`

const FORCE_MARK = '[force]'

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
  forceUpdate: false
}

let initialized = false
let beforeInstall: (() => void) | null = null

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

async function checkForUpdates(): Promise<UpdateState> {
  if (state.status === 'disabled') return state
  if (state.status === 'checking' || state.status === 'downloading') return state

  setState({ status: 'checking', error: undefined, progress: undefined })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    if (isNotFoundError(error)) {
      setState({ status: 'not-available', error: undefined })
    } else {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }
  return state
}

async function downloadUpdate(): Promise<UpdateState> {
  if (state.status === 'checking' || state.status === 'downloading') return state
  if (state.status !== 'available' && state.status !== 'error') return state
  // 检测与下载紧邻发生，下载地址仍在平台 2h 有效期内；失败重试会重新走下载
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  }
  return state
}

function installUpdate(): boolean {
  if (state.status !== 'downloaded') return false
  // 应用侧关闭守卫会阻止窗口关闭；安装前放行，避免安装器卡住
  beforeInstall?.()
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}

function bindEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    // 手动检测时 setState 已置 checking；此处兜底自动检测场景
    if (state.status !== 'checking') setState({ status: 'checking', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    const { notes, forceUpdate } = extractReleaseNotes(info)
    setState({
      status: 'available',
      latestVersion: info.version,
      notes,
      forceUpdate,
      progress: undefined,
      error: undefined
    })
    // 强制更新直接开始下载，用户只能选择「立即安装」
    if (forceUpdate) void downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      latestVersion: undefined,
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
    if (isNotFoundError(error)) {
      setState({ status: 'not-available', error: undefined })
      return
    }
    setState({ status: 'error', error: error?.message ?? String(error) })
  })
}

/**
 * 初始化自动更新：配置 feed、注册 IPC、启动后静默检测一次。
 * 必须在 app ready 之后调用。
 */
export function initAutoUpdater(options: { beforeInstall?: () => void } = {}): void {
  if (initialized) return
  initialized = true
  beforeInstall = options.beforeInstall ?? null

  state = { ...state, currentVersion: app.getVersion(), status: is.dev ? 'disabled' : 'idle' }

  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL })
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  bindEvents()

  ipcMain.handle('update:get-state', () => state)
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())

  if (!is.dev) {
    // 启动后延迟静默检测，避免与首屏渲染 / 文件加载抢资源
    setTimeout(() => void checkForUpdates(), 3000)
  }
}
