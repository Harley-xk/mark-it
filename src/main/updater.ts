import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import type { UpdateState } from '../shared/update-types'
import { registerHandle, registerOn } from './ipc-guard'

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
let onInstallFailed: (() => void) | null = null
let getMainWindow: (() => BrowserWindow | null) | null = null
/** 更新详情窗口（唯一实例，重复打开时聚焦已有窗口） */
let updateWindow: BrowserWindow | null = null

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
  try {
    autoUpdater.quitAndInstall(false, true)
    return true
  } catch (error) {
    // 安装启动失败：撤销放行标志并把错误回传给两个窗口，避免静默无反应
    onInstallFailed?.()
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to install update:', error)
    setState({ status: 'error', error: `安装失败：${message}` })
    return false
  }
}

/** 打开（或聚焦）独立的更新详情窗口 */
function openUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    if (updateWindow.isMinimized()) updateWindow.restore()
    updateWindow.show()
    updateWindow.focus()
    return
  }

  updateWindow = new BrowserWindow({
    width: 560,
    height: 680,
    minWidth: 460,
    minHeight: 520,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    center: true,
    backgroundColor: '#1c1c27',
    title: 'MarkIt 更新',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  updateWindow.once('ready-to-show', () => updateWindow?.show())
  updateWindow.on('closed', () => {
    updateWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    updateWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/update.html`)
  } else {
    updateWindow.loadFile(join(__dirname, '../renderer/update.html'))
  }
}

/**
 * 更新窗口请求安装：由主窗口负责处理未保存内容并保存会话，
 * 完成后主窗口再调用 update:install 真正退出安装。
 */
function requestInstallFromUpdateWindow(): boolean {
  if (state.status !== 'downloaded') return false
  const win = getMainWindow?.()
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('update:install-request')
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
    // 已进入安装流程后失败：撤销放行标志，避免后续关窗绕过未保存确认
    const wasInstalling = state.status === 'downloaded'
    if (isNotFoundError(error)) {
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
    beforeInstall?: () => void
    onInstallFailed?: () => void
    getMainWindow?: () => BrowserWindow | null
  } = {}
): void {
  if (initialized) return
  initialized = true
  beforeInstall = options.beforeInstall ?? null
  onInstallFailed = options.onInstallFailed ?? null
  getMainWindow = options.getMainWindow ?? null

  state = { ...state, currentVersion: app.getVersion(), status: is.dev ? 'disabled' : 'idle' }

  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL })
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  bindEvents()

  registerHandle('update:get-state', () => state)
  registerHandle('update:check', () => checkForUpdates())
  registerHandle('update:download', () => downloadUpdate())
  // 只有主窗口能真正安装：它必须先完成未保存内容确认，
  // 更新窗口必须走 update:request-install 转交主窗口
  registerHandle('update:install', (event) => {
    const win = getMainWindow?.()
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return false
    return installUpdate()
  })
  registerHandle('update:open-window', () => openUpdateWindow())
  // 更新窗口自己的关闭按钮：只关闭发送请求的窗口；
  // 主窗口不能借这个通道绕过关闭守卫，直接忽略
  registerOn('update:close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win === getMainWindow?.()) return
    win.close()
  })
  // 只接受更新窗口的转交请求；主窗口已有直接安装入口，不需要转交给自己
  registerHandle('update:request-install', (event) => {
    const win = getMainWindow?.()
    if (!win || win.isDestroyed() || event.sender === win.webContents) return false
    return requestInstallFromUpdateWindow()
  })

  if (!is.dev) {
    // 启动后延迟静默检测，避免与首屏渲染 / 文件加载抢资源
    setTimeout(() => void checkForUpdates(), 3000)
  }
}
