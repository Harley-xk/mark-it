import { app, shell, BrowserWindow, dialog, screen, protocol, net, nativeTheme } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, watchFile, unwatchFile } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { PdfExportOptions } from '../shared/pdf-types'
import type { ImageExportFormat, ImageExportOptions } from '../shared/image-types'
import type { ExportKind, ExportProgress } from '../shared/export-types'
import {
  createImageExportResult,
  ensureImageFileExtension,
  imageExtensionFor,
  resolveImageCaptureScale
} from './image-export'
import { closeUpdateWindow, initAutoUpdater } from './updater'
import { initActivityReporter, notifyActivityWindowShown } from './activity-reporter'
import { isAppUrl, registerHandle, registerOn } from './ipc-guard'
import { normalizeSessionTab, parseSessionData, parseSessionFile } from './session-store'
import { capHistoryEntries, parseEditorHistoryFile } from './editor-history-store'
import {
  closeSettingsWindow,
  getSettingsWindow,
  isSettingsWindowSender,
  openSettingsWindow
} from './settings-window'
import {
  normalizeZoomFactor,
  parseWindowStateFile,
  placeWindowOnWorkArea
} from './window-state-store'
import {
  buildTabDragPreviewHtml,
  placeTabDragPreview,
  TAB_DRAG_PREVIEW_HEIGHT,
  TAB_DRAG_PREVIEW_WIDTH
} from './tab-drag-preview'
import { applyWindowPlacement } from './window-placement'
import type { WindowState, WindowStateFile } from './window-state-store'
import type { SessionData, SessionFile, SessionTab } from '../shared/session-types'
import type { EditorHistoryFile } from '../shared/history-types'
import type {
  EditorWindowContext as RendererWindowContext,
  EditorWindowSummary,
  ExitPreparationResult,
  TabDragTargetState,
  TabTransferPayload,
  TabTransferResult
} from '../shared/window-types'
import {
  createIntegrationRuntime,
  detectVSCodeInstallations,
  installVSCodeExtension,
  uninstallVSCodeExtension,
  writeVSCodeIntegrationConfig
} from './vscode-integration'
import type { IntegrationRuntime } from './vscode-integration'

/**
 * 开发模式使用独立的 userData 目录，避免与已安装的正式版共用单实例锁、
 * 会话快照与窗口状态。必须在读取 app.getPath('userData') 之前设置：
 * 下面的 windowStateFile / sessionFile 在模块加载时就会计算路径。
 * 调用方显式传入 --user-data-dir（如 e2e）时尊重该目录，不再覆盖，
 * 否则测试会读到开发会话并在多次运行之间互相污染。
 */
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'mark-it-dev'))
}

/**
 * 文档内相对路径图片的自定义协议。
 * 渲染进程把本地绝对路径编码到查询参数里，主进程据此读取文件，
 * 这样开发模式（http://localhost）与打包后（file://）都能加载图片。
 */
const LOCAL_FILE_SCHEME = 'markit-file'
/** 该协议只用于预览图片，限制扩展名避免被 Markdown 内容当作任意文件读取通道 */
const IMAGE_FILE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_FILE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

interface EditorWindowContext {
  id: string
  win: BrowserWindow
  webContentsId: number
  rendererReady: boolean
  pendingFilePaths: string[]
  watchedFilePath: string | null
  watchedContent: string | null
  watchSeq: number
  externalChangeTimer: ReturnType<typeof setTimeout> | null
  allowClose: boolean
  saveStateTimer: ReturnType<typeof setTimeout> | null
  pendingTransferId: string | null
  pendingIncomingTransfer: TabTransferPayload | null
  openFilePaths: Set<string>
}

interface PendingTabTransfer {
  transferId: string
  sourceWebContentsId: number
  sourceWindowId: string
  targetWindowId: string
  targetCreated: boolean
  timeout: ReturnType<typeof setTimeout>
  resolve: (result: TabTransferResult | null) => void
}

interface ActiveTabDrag {
  source: EditorWindowContext
  tabName: string
  theme: 'light' | 'dark'
}

const editorWindows = new Map<number, EditorWindowContext>()
const editorWindowIds = new Map<string, number>()
const pendingTabTransfers = new Map<string, PendingTabTransfer>()
let lastFocusedWindowId: string | null = null
const preReadyFilePaths: string[] = []
let activeTabDrag: ActiveTabDrag | null = null
let tabDragFallbackTimer: ReturnType<typeof setInterval> | null = null
let tabDragTargetTimer: ReturnType<typeof setInterval> | null = null
let highlightedTabDragWindowId: string | null = null
let tabDragPreviewWindow: BrowserWindow | null = null
let tabDragPreviewReady = false
let tabDragLastMoveAt = 0
let tabDragLastPreviewPosition: ScreenPoint | null = null
let tabDragDisplayId: number | null = null

/** 位置兜底轮询间隔；仅在指针事件断流时真正移动提示窗 */
const TAB_DRAG_FALLBACK_INTERVAL = 16
/** 超过该时长未收到 window:tab-drag-move 即视为事件断流 */
const TAB_DRAG_EVENT_STALE_MS = 50
/** 目标窗口命中与高亮广播不必跟帧 */
const TAB_DRAG_TARGET_INTERVAL = 120
/** 校验提示窗实际 bounds 与期望值允许的 DIP 误差 */
const TAB_DRAG_BOUNDS_TOLERANCE = 1

const sessionWindows = new Map<string, SessionData>()
let sessionFileData: SessionFile = { version: 2, windows: [] }
const editorHistoryFileData: EditorHistoryFile = { version: 1, windows: {} }
let windowStateFileData: WindowStateFile = { version: 3, zoomFactor: 1, windows: {} }

// --- 整窗缩放 ---

const ZOOM_STEP = 0.1
/** Chromium 缩放按 origin 生效，同源窗口共享比例，因此全应用维护唯一缩放值 */
let globalZoomFactor = 1
const windowStateFile = join(app.getPath('userData'), 'window-state.json')
/** 上次打开的标签页（含未保存内容），更新重启后据此恢复文档 */
const sessionFile = join(app.getPath('userData'), 'session.json')
const editorHistoryFile = join(app.getPath('userData'), 'editor-history.json')
const vscodeIntegrationConfigFile = join(app.getPath('userData'), 'vscode-integration.json')
const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false
}
const EDITOR_MIN_WIDTH = 800
const EDITOR_MIN_HEIGHT = 600
const MAX_RESTORED_WINDOWS = 8
let sessionWriteTimer: ReturnType<typeof setTimeout> | null = null
let windowStateWriteTimer: ReturnType<typeof setTimeout> | null = null
let historyWriteChain: Promise<void> = Promise.resolve()
let appQuitAllowed = false
let quitPreparationInProgress = false
let installPreparationInProgress = false

async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  const tempPath = `${targetPath}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, targetPath)
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw err
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function persistSessionFile(): void {
  sessionFileData.windows = Array.from(sessionWindows, ([id, data]) => ({ id, ...data }))
  sessionFileData.lastFocusedWindowId = lastFocusedWindowId ?? undefined
  void writeFileAtomic(sessionFile, JSON.stringify(sessionFileData)).catch((err) => {
    console.error('Failed to save session:', err)
  })
}

function queuePersistSessionFile(): void {
  if (sessionWriteTimer) clearTimeout(sessionWriteTimer)
  sessionWriteTimer = setTimeout(() => {
    sessionWriteTimer = null
    persistSessionFile()
  }, 300)
}

function persistEditorHistoryFile(): Promise<void> {
  const content = JSON.stringify(editorHistoryFileData)
  const write = historyWriteChain
    .catch(() => undefined)
    .then(() => writeFileAtomic(editorHistoryFile, content))
  historyWriteChain = write
  return write
}

function queuePersistEditorHistoryFile(): void {
  void persistEditorHistoryFile().catch((err) => {
    console.error('Failed to save editor history:', err)
  })
}

function persistWindowStateFile(): void {
  windowStateFileData.lastFocusedWindowId = lastFocusedWindowId ?? undefined
  void writeFileAtomic(windowStateFile, JSON.stringify(windowStateFileData)).catch((err) => {
    console.error('Failed to save window state:', err)
  })
}

function queuePersistWindowStateFile(): void {
  if (windowStateWriteTimer) clearTimeout(windowStateWriteTimer)
  windowStateWriteTimer = setTimeout(() => {
    windowStateWriteTimer = null
    persistWindowStateFile()
  }, 300)
}

function initializePersistedState(): void {
  try {
    if (existsSync(sessionFile)) {
      const parsed = parseSessionFile(JSON.parse(readFileSync(sessionFile, 'utf-8')))
      if (parsed) {
        const usedIds = new Set<string>()
        for (const window of parsed.windows.slice(0, MAX_RESTORED_WINDOWS)) {
          let id = window.id
          if (id === 'legacy' || usedIds.has(id)) id = randomUUID()
          usedIds.add(id)
          sessionWindows.set(id, { tabs: window.tabs, activeIndex: window.activeIndex })
        }
        sessionFileData = {
          version: 2,
          windows: [],
          lastFocusedWindowId:
            parsed.lastFocusedWindowId === 'legacy'
              ? sessionWindows.keys().next().value
              : parsed.lastFocusedWindowId
        }
      }
    }
  } catch (err) {
    console.error('Failed to load session:', err)
  }

  try {
    if (existsSync(editorHistoryFile)) {
      const parsed = parseEditorHistoryFile(JSON.parse(readFileSync(editorHistoryFile, 'utf-8')))
      if (parsed) {
        for (const [windowId, entries] of Object.entries(parsed.windows)) {
          if (sessionWindows.size === 0 || sessionWindows.has(windowId)) {
            editorHistoryFileData.windows[windowId] = entries
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load editor history:', err)
  }

  const firstWindowId =
    sessionFileData.lastFocusedWindowId ?? sessionWindows.keys().next().value ?? randomUUID()
  try {
    if (existsSync(windowStateFile)) {
      const parsed = parseWindowStateFile(
        JSON.parse(readFileSync(windowStateFile, 'utf-8')),
        firstWindowId
      )
      if (parsed) windowStateFileData = parsed
    }
  } catch (err) {
    console.error('Failed to load window state:', err)
  }
  globalZoomFactor = windowStateFileData.zoomFactor

  lastFocusedWindowId =
    windowStateFileData.lastFocusedWindowId ??
    sessionFileData.lastFocusedWindowId ??
    sessionWindows.keys().next().value ??
    firstWindowId
  if (
    sessionWindows.size > 0 &&
    (!lastFocusedWindowId || !sessionWindows.has(lastFocusedWindowId))
  ) {
    lastFocusedWindowId = sessionWindows.keys().next().value ?? firstWindowId
  }
  if (!sessionWindows.has(lastFocusedWindowId) && editorWindows.size === 0) {
    // 只有旧窗口状态、没有会话时，firstWindowId 仍是首个窗口的稳定 ID。
    lastFocusedWindowId = firstWindowId
  }
}

function getEditorWindowBySender(contents: WebContents): EditorWindowContext | null {
  const context = editorWindows.get(contents.id)
  return context && !context.win.isDestroyed() ? context : null
}

function getFocusedEditorWindow(): EditorWindowContext | null {
  if (lastFocusedWindowId) {
    const id = editorWindowIds.get(lastFocusedWindowId)
    const context = id ? editorWindows.get(id) : undefined
    if (context && !context.win.isDestroyed()) return context
  }
  return Array.from(editorWindows.values()).find((context) => !context.win.isDestroyed()) ?? null
}

function focusEditorWindow(context: EditorWindowContext): void {
  if (context.win.isMinimized()) context.win.restore()
  context.win.show()
  context.win.focus()
}

function isEditorWindowSender(contents: WebContents): boolean {
  return !!getEditorWindowBySender(contents)
}

function windowForSender(event: IpcMainInvokeEvent): BrowserWindow | null {
  return getEditorWindowBySender(event.sender)?.win ?? null
}

/** 只为发起导出的渲染进程创建阶段进度上报，避免多窗口串进度 */
function createExportProgressReporter(
  event: IpcMainInvokeEvent,
  requestId: string,
  kind: ExportKind
): (percent: number, stage: string) => void {
  const safeRequestId = typeof requestId === 'string' ? requestId.slice(0, 128) : ''
  return (percent, stage) => {
    if (!safeRequestId || event.sender.isDestroyed()) return
    const progress: ExportProgress = {
      requestId: safeRequestId,
      kind,
      percent: Math.min(100, Math.max(0, Math.round(percent))),
      stage
    }
    event.sender.send('export:progress', progress)
  }
}

/** 应用全局缩放比例：所有编辑窗口与设置窗口同步缩放，并持久化 */
function applyZoomFactor(factor: number): void {
  globalZoomFactor = normalizeZoomFactor(factor)
  windowStateFileData.zoomFactor = globalZoomFactor
  for (const context of editorWindows.values()) {
    if (context.win.isDestroyed()) continue
    context.win.webContents.setZoomFactor(globalZoomFactor)
    context.win.webContents.send('window:zoom-changed', globalZoomFactor)
  }
  const settings = getSettingsWindow()
  if (settings && !settings.isDestroyed()) {
    settings.webContents.setZoomFactor(globalZoomFactor)
    settings.webContents.send('window:zoom-changed', globalZoomFactor)
  }
  queuePersistWindowStateFile()
}

function zoomBy(delta: number): void {
  applyZoomFactor(globalZoomFactor + delta)
}

/**
 * 从命令行参数中提取文件路径（可能一次传入多个文件）
 * 开发模式下跳过 electron-vite 注入的参数（以 -/ electron 开头的）
 */
function extractFilePaths(argv: string[]): string[] {
  const paths: string[] = []
  for (const arg of argv) {
    // 跳过选项参数和 electron 自身
    if (arg.startsWith('-') || arg === 'electron') continue
    // 跳过 .js/.ts 入口文件（electron-vite dev 模式）
    if (arg.endsWith('.js') || arg.endsWith('.ts')) continue
    // 绝对路径且文件存在 => 当作文件打开
    if (arg.includes(':') || arg.startsWith('/')) {
      if (
        arg.toLowerCase().endsWith('.md') ||
        arg.toLowerCase().endsWith('.markdown') ||
        arg.toLowerCase().endsWith('.txt')
      ) {
        paths.push(arg)
      }
    }
  }
  return paths
}

function queueFileForWindow(context: EditorWindowContext, filePath: string): void {
  if (!context.pendingFilePaths.includes(filePath)) context.pendingFilePaths.push(filePath)
}

function findEditorWindowForOpenPath(filePath: string): EditorWindowContext | null {
  for (const context of editorWindows.values()) {
    if (context.win.isDestroyed()) continue
    if (Array.from(context.openFilePaths).some((openPath) => sameFilePath(openPath, filePath))) {
      return context
    }
  }
  return null
}

function deliverOpenFile(context: EditorWindowContext, filePath: string, content: string): void {
  focusEditorWindow(context)
  if (!context.rendererReady || context.win.isDestroyed()) {
    queueFileForWindow(context, filePath)
    return
  }
  context.win.webContents.send('open-file-from-argv', { path: filePath, content })
}

/**
 * 打开指定文件：读取内容并发送到指定编辑窗口。
 * 窗口注册好监听前先缓存在该窗口自己的队列，避免多窗口互相抢文件。
 */
async function openFileAtPath(filePath: string, target?: EditorWindowContext): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const context =
      findEditorWindowForOpenPath(filePath) ??
      target ??
      getFocusedEditorWindow() ??
      createEditorWindow()
    if (!context) return
    // 读取期间页面可能开始重载，此时发送会丢，重新排队等下一次 ready
    if (!editorWindows.get(context.webContentsId)?.rendererReady || context.win.isDestroyed()) {
      queueFileForWindow(context, filePath)
      return
    }
    deliverOpenFile(context, filePath, content)
  } catch (err) {
    console.error('Failed to open file from argv:', err)
  }
}

/** 按传入顺序依次打开（多个文件时最后一个是激活标签） */
async function openFilesAtPaths(filePaths: string[], target?: EditorWindowContext): Promise<void> {
  for (const filePath of filePaths) {
    await openFileAtPath(filePath, target)
  }
}

/**
 * macOS Finder / VSCode LaunchServices 通过 open-file 投递路径。
 * 监听必须在 app.whenReady() 之前注册，否则首个文件可能被系统丢弃。
 */
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!/\.(?:md|markdown)$/i.test(filePath)) return
  if (!app.isReady()) {
    if (!preReadyFilePaths.includes(filePath)) preReadyFilePaths.push(filePath)
    return
  }
  const target = getFocusedEditorWindow() ?? createEditorWindow()
  if (target) focusEditorWindow(target)
  void openFilesAtPaths([filePath])
})

/** VSCode 集成运行时由主进程构造，渲染进程只能传 variant */
function getVSCodeIntegrationRuntime(): IntegrationRuntime {
  return createIntegrationRuntime({
    platform: process.platform,
    env: process.env,
    userDataDir: dirname(vscodeIntegrationConfigFile),
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    extensionSourcePaths: [
      join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'vscode-extension'),
      join(app.getAppPath(), 'resources', 'vscode-extension'),
      join(process.cwd(), 'resources', 'vscode-extension')
    ]
  })
}

// --- 活跃文件监视 ---

/** Windows 下路径大小写、分隔符不敏感 */
function sameFilePath(a: string, b: string): boolean {
  const normalize = (p: string): string =>
    (process.platform === 'win32' ? p.toLowerCase() : p).replace(/\\/g, '/')
  return normalize(a) === normalize(b)
}

async function pushExternalChange(
  context: EditorWindowContext,
  filePath: string,
  seq: number
): Promise<void> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    // 文件被删除或在保存瞬间暂时不可读：保留编辑器现有内容，等下一次事件
    return
  }
  // 读取期间可能已经切换了监视目标，丢弃过期结果
  if (
    seq !== context.watchSeq ||
    !context.watchedFilePath ||
    !sameFilePath(filePath, context.watchedFilePath)
  ) {
    return
  }
  if (content === context.watchedContent) return
  context.watchedContent = content
  if (!context.win.isDestroyed()) {
    context.win.webContents.send('file:external-change', { path: filePath, content })
  }
}

/**
 * 切换监视目标（传 null 取消）。
 * 用 watchFile 轮询而不是 fs.watch：编辑器常用的「写临时文件再重命名」
 * 在 Windows 上会让 fs.watch 丢失目标，watchFile 只关心最终文件的 stat，更可靠。
 */
function setWatchedFile(context: EditorWindowContext, filePath: string | null): void {
  if (filePath === context.watchedFilePath) return
  if (context.watchedFilePath) unwatchFile(context.watchedFilePath)
  if (context.externalChangeTimer) {
    clearTimeout(context.externalChangeTimer)
    context.externalChangeTimer = null
  }

  context.watchedFilePath = filePath
  context.watchedContent = null
  const seq = ++context.watchSeq
  if (!filePath) return

  watchFile(filePath, { interval: 400 }, () => {
    if (context.externalChangeTimer) clearTimeout(context.externalChangeTimer)
    context.externalChangeTimer = setTimeout(() => {
      context.externalChangeTimer = null
      void pushExternalChange(context, filePath, seq)
    }, 150)
  })
}

function isValidWindowBounds(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true
  const workArea = screen.getDisplayMatching({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height
  }).workArea
  return (
    state.x < workArea.x + workArea.width &&
    state.x + state.width > workArea.x &&
    state.y < workArea.y + workArea.height &&
    state.y + state.height > workArea.y
  )
}

interface ScreenPoint {
  x: number
  y: number
}

function resolveWindowState(
  windowId: string,
  source?: BrowserWindow | null,
  anchorPoint?: ScreenPoint | null
): WindowState {
  const saved = windowStateFileData.windows[windowId]
  if (saved && isValidWindowBounds(saved)) return { ...saved }

  const sourceBounds = source && !source.isDestroyed() ? source.getBounds() : null
  const display = anchorPoint
    ? screen.getDisplayNearestPoint(anchorPoint)
    : sourceBounds
      ? screen.getDisplayMatching(sourceBounds)
      : screen.getPrimaryDisplay()
  const workArea = display.workArea
  if (anchorPoint) {
    return {
      ...DEFAULT_WINDOW_STATE,
      ...placeWindowOnWorkArea(
        workArea,
        DEFAULT_WINDOW_STATE.width,
        DEFAULT_WINDOW_STATE.height,
        anchorPoint
      )
    }
  }
  const width = Math.min(DEFAULT_WINDOW_STATE.width, workArea.width)
  const height = Math.min(DEFAULT_WINDOW_STATE.height, workArea.height)
  const offset = sourceBounds ? 32 : 0
  const x = sourceBounds
    ? Math.min(Math.max(sourceBounds.x + offset, workArea.x), workArea.x + workArea.width - width)
    : undefined
  const y = sourceBounds
    ? Math.min(Math.max(sourceBounds.y + offset, workArea.y), workArea.y + workArea.height - height)
    : undefined
  return {
    ...DEFAULT_WINDOW_STATE,
    width,
    height,
    ...(x !== undefined && y !== undefined ? { x, y } : {})
  }
}

function saveWindowState(context: EditorWindowContext): void {
  if (context.win.isDestroyed()) return
  const bounds = context.win.getNormalBounds()
  windowStateFileData.windows[context.id] = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: context.win.isMaximized()
  }
  queuePersistWindowStateFile()
}

function queueSaveWindowState(context: EditorWindowContext): void {
  if (context.saveStateTimer) clearTimeout(context.saveStateTimer)
  context.saveStateTimer = setTimeout(() => {
    context.saveStateTimer = null
    saveWindowState(context)
  }, 500)
}

interface CreateEditorWindowOptions {
  id?: string
  source?: BrowserWindow | null
  initialSession?: SessionData
  pendingTransfer?: TabTransferPayload | null
  anchorPoint?: ScreenPoint | null
}

function createEditorWindow(options: CreateEditorWindowOptions = {}): EditorWindowContext | null {
  const isMac = process.platform === 'darwin'
  let windowId = options.id ?? randomUUID()
  while (editorWindowIds.has(windowId)) windowId = randomUUID()

  const windowState = resolveWindowState(windowId, options.source, options.anchorPoint)
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x !== undefined && windowState.y !== undefined
      ? { x: windowState.x, y: windowState.y }
      : {}),
    minWidth: EDITOR_MIN_WIDTH,
    minHeight: EDITOR_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 16, y: 12 }
        }
      : {
          frame: false,
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#888',
            height: 36
          }
        }),
    vibrancy: 'under-window',
    backgroundMaterial: 'acrylic',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 混合缩放显示器下构造参数会被二次换算，创建后按 DIP 几何校正一次
  const initialBounds = win.getBounds()
  applyWindowPlacement(win, {
    width: windowState.width,
    height: windowState.height,
    minWidth: Math.min(EDITOR_MIN_WIDTH, windowState.width),
    minHeight: Math.min(EDITOR_MIN_HEIGHT, windowState.height),
    x: windowState.x ?? initialBounds.x,
    y: windowState.y ?? initialBounds.y
  })

  const context: EditorWindowContext = {
    id: windowId,
    win,
    webContentsId: win.webContents.id,
    rendererReady: false,
    pendingFilePaths: [],
    watchedFilePath: null,
    watchedContent: null,
    watchSeq: 0,
    externalChangeTimer: null,
    allowClose: false,
    saveStateTimer: null,
    pendingTransferId: options.pendingTransfer?.transferId ?? null,
    pendingIncomingTransfer: options.pendingTransfer ?? null,
    openFilePaths: new Set()
  }
  editorWindows.set(context.webContentsId, context)
  editorWindowIds.set(windowId, context.webContentsId)
  if (options.initialSession) sessionWindows.set(windowId, options.initialSession)

  if (windowState.isMaximized) win.maximize()

  win.on('focus', () => {
    lastFocusedWindowId = context.id
    windowStateFileData.lastFocusedWindowId = context.id
    sessionFileData.lastFocusedWindowId = context.id
    queuePersistWindowStateFile()
    queuePersistSessionFile()
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (
      isMac &&
      input.meta &&
      !input.control &&
      !input.alt &&
      !input.shift &&
      input.key.toLowerCase() === 'w'
    ) {
      event.preventDefault()
      context.win.webContents.send('shortcut:close-tab')
      return
    }

    const zoomModifier = isMac ? input.meta : input.control
    if (!zoomModifier || input.alt) return

    if (input.key === '+' || input.key === '=') {
      event.preventDefault()
      zoomBy(ZOOM_STEP)
    } else if (input.key === '-' || input.key === '_') {
      event.preventDefault()
      zoomBy(-ZOOM_STEP)
    } else if (input.key === '0' && !input.shift) {
      event.preventDefault()
      applyZoomFactor(1)
    }
  })

  win.on('enter-full-screen', () => {
    if (!context.win.isDestroyed()) context.win.webContents.send('window:fullscreen', true)
  })
  win.on('leave-full-screen', () => {
    if (!context.win.isDestroyed()) context.win.webContents.send('window:fullscreen', false)
  })

  win.on('ready-to-show', () => {
    if (!context.win.isDestroyed()) context.win.show()
    // 首个编辑窗口可见时记录一次 start + activate；后台窗口不会触发
    notifyActivityWindowShown()
  })

  win.on('resize', () => queueSaveWindowState(context))
  win.on('move', () => queueSaveWindowState(context))
  win.on('close', () => saveWindowState(context))
  win.on('closed', () => {
    const senderId = context.webContentsId
    const remainingBeforeDelete = editorWindows.size
    if (context.externalChangeTimer) clearTimeout(context.externalChangeTimer)
    if (context.saveStateTimer) clearTimeout(context.saveStateTimer)
    setWatchedFile(context, null)
    editorWindows.delete(senderId)
    editorWindowIds.delete(context.id)
    if (activeTabDrag?.source.id === context.id || highlightedTabDragWindowId === context.id) {
      clearTabDragHighlight()
    }

    for (const [requestId, preparation] of pendingExitPreparations) {
      if (!preparation.pendingWebContents.delete(senderId)) continue
      pendingExitPreparations.delete(requestId)
      preparation.resolve(false)
    }

    const failedTransfers = Array.from(pendingTabTransfers.values())
      .filter((transfer) => transfer.targetWindowId === context.id)
      .map((transfer) => transfer.transferId)
    for (const transferId of failedTransfers) notifyTabTransferFailure(transferId)

    if (!appQuitAllowed && remainingBeforeDelete > 1) {
      sessionWindows.delete(context.id)
      delete editorHistoryFileData.windows[context.id]
      delete windowStateFileData.windows[context.id]
      persistSessionFile()
      queuePersistEditorHistoryFile()
      persistWindowStateFile()
    }

    if (lastFocusedWindowId === context.id) {
      lastFocusedWindowId = getFocusedEditorWindow()?.id ?? null
    }
    if (editorWindows.size === 0) {
      closeSettingsWindow()
      closeUpdateWindow()
    }
  })

  win.on('close', (event) => {
    if (context.allowClose) return
    if (!context.win.isDestroyed()) {
      event.preventDefault()
      context.win.webContents.send('window:close-request', { quit: false })
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    openLinkExternally(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openLinkExternally(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-start-loading', () => {
    context.rendererReady = false
  })

  win.webContents.on('did-finish-load', () => {
    if (context.win.isDestroyed()) return
    context.win.webContents.setZoomFactor(globalZoomFactor)
    context.win.webContents.send('window:zoom-changed', globalZoomFactor)
  })

  return context
}

interface PendingExitPreparation {
  pendingWebContents: Set<number>
  resolve: (ok: boolean) => void
}

const pendingExitPreparations = new Map<string, PendingExitPreparation>()

function requestEditorPreparation(kind: 'quit' | 'install'): Promise<boolean> {
  const targets = Array.from(editorWindows.values()).filter(
    (context) => context.rendererReady && !context.win.isDestroyed()
  )
  if (targets.length === 0) return Promise.resolve(true)

  const requestId = randomUUID()
  const actionLabel = kind === 'install' ? '安装更新' : '退出应用'
  return new Promise((resolve) => {
    pendingExitPreparations.set(requestId, {
      pendingWebContents: new Set(targets.map((context) => context.win.webContents.id)),
      resolve
    })
    for (const context of targets) {
      context.win.webContents.send('app:prepare-exit', { requestId, kind, actionLabel })
    }
  })
}

function setAllEditorWindowsReadyToClose(): void {
  for (const context of editorWindows.values()) context.allowClose = true
}

async function prepareForInstall(): Promise<boolean> {
  if (installPreparationInProgress) return false
  installPreparationInProgress = true
  try {
    const prepared = await requestEditorPreparation('install')
    if (prepared) setAllEditorWindowsReadyToClose()
    return prepared
  } finally {
    installPreparationInProgress = false
  }
}

const MAX_EDITOR_STATE_TRANSFER_CHARS = 4 * 1024 * 1024

function normalizeTabTransferPayload(payload: unknown): TabTransferPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const request = payload as Partial<TabTransferPayload>
  if (typeof request.transferId !== 'string' || request.transferId.length === 0) return null
  const tab = normalizeSessionTab(request.tab)
  if (!tab) return null

  let editorStateJson = request.editorStateJson
  if (editorStateJson !== undefined) {
    try {
      if (JSON.stringify(editorStateJson).length > MAX_EDITOR_STATE_TRANSFER_CHARS) {
        editorStateJson = undefined
      }
    } catch {
      editorStateJson = undefined
    }
  }
  return { transferId: request.transferId, tab, editorStateJson }
}

function notifyTabTransferFailure(transferId: string): void {
  const transfer = pendingTabTransfers.get(transferId)
  if (!transfer) return
  clearTimeout(transfer.timeout)
  pendingTabTransfers.delete(transferId)
  const targetSenderId = editorWindowIds.get(transfer.targetWindowId)
  const target = targetSenderId ? editorWindows.get(targetSenderId) : undefined
  if (target && !target.win.isDestroyed()) {
    target.pendingTransferId = null
    target.pendingIncomingTransfer = null
    if (transfer.targetCreated) target.win.destroy()
  }
  if (transfer.targetCreated) {
    sessionWindows.delete(transfer.targetWindowId)
    delete windowStateFileData.windows[transfer.targetWindowId]
  }
  transfer.resolve(null)
  queuePersistSessionFile()
  queuePersistWindowStateFile()
}

function createBlankSession(): SessionData {
  const tab: SessionTab = {
    path: null,
    name: 'untitled.md',
    content: '',
    isModified: false,
    cursorLine: 1,
    cursorCol: 1,
    eol: '\n',
    bom: false
  }
  return { tabs: [tab], activeIndex: 0 }
}

function findEditorWindowAtCursor(
  source: EditorWindowContext,
  point = screen.getCursorScreenPoint()
): EditorWindowContext | null {
  const sourceBounds = source.win.getBounds()
  if (
    point.x >= sourceBounds.x &&
    point.x < sourceBounds.x + sourceBounds.width &&
    point.y >= sourceBounds.y &&
    point.y < sourceBounds.y + sourceBounds.height
  ) {
    return null
  }
  for (const context of editorWindows.values()) {
    if (context.id === source.id || context.win.isDestroyed()) continue
    if (!context.win.isVisible() || context.win.isMinimized()) continue
    if (!context.rendererReady || context.pendingTransferId) continue
    const bounds = context.win.getBounds()
    if (
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
    ) {
      return context
    }
  }
  return null
}

function broadcastTabDragTarget(state: TabDragTargetState): void {
  for (const context of editorWindows.values()) {
    if (!context.win.isDestroyed()) context.win.webContents.send('window:tab-drag-target', state)
  }
}

function closeTabDragPreview(): void {
  const preview = tabDragPreviewWindow
  tabDragPreviewWindow = null
  tabDragPreviewReady = false
  if (preview && !preview.isDestroyed()) preview.destroy()
}

function createTabDragPreview(tabName: string, theme: 'light' | 'dark'): void {
  if (tabDragPreviewWindow && !tabDragPreviewWindow.isDestroyed()) return

  const preview = new BrowserWindow({
    width: TAB_DRAG_PREVIEW_WIDTH,
    height: TAB_DRAG_PREVIEW_HEIGHT,
    frame: false,
    transparent: true,
    // 透明窗必须显式指定全透明背景，否则首帧可能闪白
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  tabDragPreviewWindow = preview
  tabDragPreviewReady = false
  preview.setIgnoreMouseEvents(true)
  preview.setAlwaysOnTop(true, 'screen-saver')
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  preview.on('closed', () => {
    if (tabDragPreviewWindow === preview) {
      tabDragPreviewWindow = null
      tabDragPreviewReady = false
    }
  })

  /** 首帧绘制完成后再定位并显示，避免空透明窗口先闪现 */
  const showWhenReady = (): void => {
    if (tabDragPreviewWindow !== preview || !activeTabDrag) {
      if (!preview.isDestroyed()) preview.destroy()
      return
    }
    if (tabDragPreviewReady) return
    tabDragPreviewReady = true
    // 加载期间位置可能已更新过，显示前强制重新定位一次
    tabDragLastPreviewPosition = null
    updateTabDragPreviewPosition(screen.getCursorScreenPoint())
  }
  preview.once('ready-to-show', showWhenReady)

  const html = buildTabDragPreviewHtml(tabName, theme)
  void preview
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .then(() => {
      // ready-to-show 是首选路径；个别平台不触发时由加载完成兜底
      showWhenReady()
    })
    .catch((err) => {
      if (preview.isDestroyed()) return
      console.error('Failed to load tab drag preview:', err)
      closeTabDragPreview()
    })
}

/**
 * 每次按光标位置重新取显示器，不缓存 workArea。
 * 混合缩放显示器下 DIP 坐标可能与缓存 bounds 出现偏差，缓存会让提示窗被夹取到错误屏幕。
 */
function resolveTabDragDisplay(cursor: ScreenPoint): {
  workArea: { x: number; y: number; width: number; height: number }
  displayChanged: boolean
} {
  const display = screen.getDisplayNearestPoint(cursor)
  const displayChanged = tabDragDisplayId !== null && tabDragDisplayId !== display.id
  tabDragDisplayId = display.id
  return { workArea: display.workArea, displayChanged }
}

function updateTabDragPreviewPosition(cursor: ScreenPoint): void {
  if (!activeTabDrag || activeTabDrag.source.win.isDestroyed()) return
  createTabDragPreview(activeTabDrag.tabName, activeTabDrag.theme)
  const preview = tabDragPreviewWindow
  if (!preview || preview.isDestroyed()) return

  const { workArea, displayChanged } = resolveTabDragDisplay(cursor)
  const position = placeTabDragPreview(
    cursor,
    { width: TAB_DRAG_PREVIEW_WIDTH, height: TAB_DRAG_PREVIEW_HEIGHT },
    workArea
  )
  const moved =
    !tabDragLastPreviewPosition ||
    tabDragLastPreviewPosition.x !== position.x ||
    tabDragLastPreviewPosition.y !== position.y
  if (moved || displayChanged) {
    tabDragLastPreviewPosition = position
    // 始终传完整 bounds：混合缩放显示器下构造函数参数可能被二次换算，只改坐标会保留错误尺寸
    preview.setBounds(
      {
        ...position,
        width: TAB_DRAG_PREVIEW_WIDTH,
        height: TAB_DRAG_PREVIEW_HEIGHT
      },
      false
    )
    // 透明窗跨 DPI 显示器后可能丢失合成内容，强制重绘恢复图标
    if (displayChanged) preview.webContents.invalidate()
  }
  if (tabDragPreviewReady && !preview.isVisible()) preview.showInactive()
}

function clearTabDragHighlight(): void {
  if (tabDragFallbackTimer) clearInterval(tabDragFallbackTimer)
  if (tabDragTargetTimer) clearInterval(tabDragTargetTimer)
  tabDragFallbackTimer = null
  tabDragTargetTimer = null
  const hadHighlight = highlightedTabDragWindowId !== null
  const sourceWindowId = activeTabDrag?.source.id ?? ''
  const tabName = activeTabDrag?.tabName ?? ''
  activeTabDrag = null
  highlightedTabDragWindowId = null
  tabDragLastMoveAt = 0
  tabDragLastPreviewPosition = null
  tabDragDisplayId = null
  closeTabDragPreview()
  if (hadHighlight) {
    broadcastTabDragTarget({ active: false, tabName, sourceWindowId })
  }
}

/** 跨屏 DPI 切换后窗口可能被系统移位或改尺寸，定期校正并触发重绘 */
function ensureTabDragPreviewBounds(): void {
  const preview = tabDragPreviewWindow
  const desired = tabDragLastPreviewPosition
  if (!preview || preview.isDestroyed() || !desired) return
  const actual = preview.getBounds()
  if (
    Math.abs(actual.x - desired.x) <= TAB_DRAG_BOUNDS_TOLERANCE &&
    Math.abs(actual.y - desired.y) <= TAB_DRAG_BOUNDS_TOLERANCE &&
    Math.abs(actual.width - TAB_DRAG_PREVIEW_WIDTH) <= TAB_DRAG_BOUNDS_TOLERANCE &&
    Math.abs(actual.height - TAB_DRAG_PREVIEW_HEIGHT) <= TAB_DRAG_BOUNDS_TOLERANCE
  ) {
    return
  }
  preview.setBounds(
    {
      ...desired,
      width: TAB_DRAG_PREVIEW_WIDTH,
      height: TAB_DRAG_PREVIEW_HEIGHT
    },
    false
  )
  preview.webContents.invalidate()
}

/** 目标检测与跟随解耦：只在命中窗口变化时广播，避免每帧遍历窗口 */
function updateTabDragTarget(): void {
  if (!activeTabDrag || activeTabDrag.source.win.isDestroyed()) {
    clearTabDragHighlight()
    return
  }
  ensureTabDragPreviewBounds()
  const cursor = screen.getCursorScreenPoint()
  const target = findEditorWindowAtCursor(activeTabDrag.source, cursor)
  const nextWindowId = target?.id ?? null
  if (nextWindowId === highlightedTabDragWindowId) return

  highlightedTabDragWindowId = nextWindowId
  for (const context of editorWindows.values()) {
    if (context.win.isDestroyed()) continue
    context.win.webContents.send('window:tab-drag-target', {
      active: context.id === nextWindowId,
      tabName: activeTabDrag.tabName,
      sourceWindowId: activeTabDrag.source.id
    })
  }
}

/** 指针事件断流时的位置兜底；事件正常时每个 tick 只做一次时间比较 */
function updateTabDragFallback(): void {
  if (!activeTabDrag || activeTabDrag.source.win.isDestroyed()) {
    clearTabDragHighlight()
    return
  }
  if (Date.now() - tabDragLastMoveAt < TAB_DRAG_EVENT_STALE_MS) return
  updateTabDragPreviewPosition(screen.getCursorScreenPoint())
}

/** 事件驱动跟随：以主进程读取的系统光标为准，避开页面缩放与跨屏 DPI 换算 */
function handleTabDragMove(source: EditorWindowContext): void {
  if (!activeTabDrag || activeTabDrag.source.id !== source.id) return
  tabDragLastMoveAt = Date.now()
  updateTabDragPreviewPosition(screen.getCursorScreenPoint())
}

function startTabDrag(source: EditorWindowContext, tabName: string, theme: 'light' | 'dark'): void {
  clearTabDragHighlight()
  activeTabDrag = { source, tabName: tabName.slice(0, 200), theme }
  tabDragLastMoveAt = 0
  tabDragLastPreviewPosition = null
  tabDragDisplayId = null
  createTabDragPreview(activeTabDrag.tabName, theme)
  updateTabDragPreviewPosition(screen.getCursorScreenPoint())
  tabDragFallbackTimer = setInterval(updateTabDragFallback, TAB_DRAG_FALLBACK_INTERVAL)
  tabDragTargetTimer = setInterval(updateTabDragTarget, TAB_DRAG_TARGET_INTERVAL)
}

function startTabTransfer(
  source: EditorWindowContext,
  payload: TabTransferPayload,
  target: EditorWindowContext | null,
  anchorPoint?: ScreenPoint | null
): Promise<TabTransferResult | null> {
  const createdTarget = !target
  const transferTarget =
    target ??
    createEditorWindow({
      source: source.win,
      initialSession: { tabs: [payload.tab], activeIndex: 0 },
      pendingTransfer: payload,
      anchorPoint
    })
  if (!transferTarget) return Promise.resolve(null)
  if (transferTarget.pendingTransferId && transferTarget.pendingTransferId !== payload.transferId) {
    if (createdTarget) transferTarget.win.destroy()
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => notifyTabTransferFailure(payload.transferId), 5000)
    pendingTabTransfers.set(payload.transferId, {
      transferId: payload.transferId,
      sourceWebContentsId: source.win.webContents.id,
      sourceWindowId: source.id,
      targetWindowId: transferTarget.id,
      targetCreated: createdTarget,
      timeout,
      resolve
    })

    if (!createdTarget) {
      transferTarget.pendingTransferId = payload.transferId
      transferTarget.pendingIncomingTransfer = payload
      focusEditorWindow(transferTarget)
      transferTarget.win.webContents.send('window:receive-tab-transfer', payload)
    }
    queuePersistSessionFile()
  })
}

async function moveTabToNewWindow(
  source: EditorWindowContext,
  payload: unknown
): Promise<TabTransferResult | null> {
  const transfer = normalizeTabTransferPayload(payload)
  return transfer ? startTabTransfer(source, transfer, null) : null
}

async function moveTabToTargetWindow(
  source: EditorWindowContext,
  payload: unknown,
  options?: unknown
): Promise<TabTransferResult | null> {
  const transfer = normalizeTabTransferPayload(payload)
  if (!transfer) return null
  const forceNew =
    !!options &&
    typeof options === 'object' &&
    (options as { forceNew?: unknown }).forceNew === true
  const point = screen.getCursorScreenPoint()
  const target = forceNew ? null : findEditorWindowAtCursor(source, point)
  return startTabTransfer(source, transfer, target, point)
}

async function moveTabToWindow(
  source: EditorWindowContext,
  payload: unknown,
  targetWindowId: unknown
): Promise<TabTransferResult | null> {
  if (typeof targetWindowId !== 'string') return null
  const transfer = normalizeTabTransferPayload(payload)
  if (!transfer) return null
  const targetSenderId = editorWindowIds.get(targetWindowId)
  const target = targetSenderId ? editorWindows.get(targetSenderId) : undefined
  if (!target || target.id === source.id || !target.rendererReady || target.pendingTransferId) {
    return null
  }
  return startTabTransfer(source, transfer, target)
}

// --- 文档内链接处理 ---

/** 允许交给系统默认程序打开的外部协议 */
const EXTERNAL_LINK_PROTOCOL = /^(?:https?|mailto):$/i

/**
 * 在系统文件管理器中定位本地文件；文件不存在时退回到所在目录。
 * 目录也不存在则不执行任何操作。
 */
function revealPath(targetPath: string): boolean {
  if (!targetPath) return false
  try {
    if (existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
      return true
    }
    const parent = dirname(targetPath)
    if (existsSync(parent)) {
      void shell.openPath(parent)
      return true
    }
  } catch (err) {
    console.error('Failed to reveal path:', targetPath, err)
  }
  return false
}

/** 按链接类型分流：网络地址交给默认浏览器，file:// 定位到文件所在目录 */
function openLinkExternally(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (EXTERNAL_LINK_PROTOCOL.test(parsed.protocol)) {
      void shell.openExternal(url)
      return true
    }
    if (parsed.protocol === 'file:') {
      return revealPath(fileURLToPath(parsed))
    }
  } catch {
    // 非法地址直接忽略，绝不交给编辑窗口导航
  }
  return false
}

// --- IPC handlers ---

/** 生成保存对话框的默认文件名：只保留文件名部分，剔除非法字符并补齐扩展名 */
function sanitizeFileName(name: string, extension: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  // 控制字符在文件名中非法，这里需要显式匹配
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
  if (!cleaned) return `untitled.${extension}`
  return cleaned.toLowerCase().endsWith(`.${extension}`) ? cleaned : `${cleaned}.${extension}`
}

/**
 * 渲染进程已注册文件打开监听。此前排队的文件（首次启动的命令行参数、
 * 启动期间到达的 second-instance 文件）在这里按窗口统一放行。
 */
registerOn('renderer:ready', (event) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return
  context.rendererReady = true
  const queued = context.pendingFilePaths.splice(0)
  if (queued.length > 0) void openFilesAtPaths(queued, context)
})

registerHandle('dialog:openFiles', async (event) => {
  const parent = windowForSender(event)
  if (!parent) return []
  const result = await dialog.showOpenDialog(parent, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return []

  const files: { path: string; content: string }[] = []
  for (const filePath of result.filePaths) {
    try {
      const content = await readFile(filePath, 'utf-8')
      const owner = findEditorWindowForOpenPath(filePath)
      if (owner) {
        deliverOpenFile(owner, filePath, content)
        continue
      }
      files.push({ path: filePath, content })
    } catch (err) {
      console.error('Failed to read file:', filePath, err)
    }
  }
  return files
})

registerHandle('file:save', async (_e, filePath: string, content: string) => {
  await writeFile(filePath, content, 'utf-8')
  // 应用自身的写入不是外部修改：同步已知版本，避免监视器回环通知
  for (const context of editorWindows.values()) {
    if (context.watchedFilePath && sameFilePath(filePath, context.watchedFilePath)) {
      context.watchedContent = content
    }
  }
  return true
})

registerHandle('file:read', async (_e, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { path: filePath, content }
  } catch (err) {
    console.error('Failed to read file:', err)
    return null
  }
})

/** 只监视渲染进程当前活跃标签的文件；切换标签时由渲染进程重新指定 */
registerHandle('file:watch', (event, filePath: string | null) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return false
  setWatchedFile(context, typeof filePath === 'string' && filePath.length > 0 ? filePath : null)
  return true
})

registerHandle('file:sync-open-paths', (event, paths: unknown) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return false
  context.openFilePaths = new Set(
    Array.isArray(paths)
      ? paths.filter((path): path is string => typeof path === 'string' && !!path)
      : []
  )
  return true
})

/** 在系统文件管理器中定位文件；文件已被删除时退回到所在目录 */
registerHandle('file:reveal', (_e, filePath: string) => {
  if (typeof filePath !== 'string') return false
  return revealPath(filePath)
})

/** 用系统默认程序打开外部链接（仅 http/https/mailto，其余协议忽略） */
registerHandle('shell:openExternal', (_e, url: string) => {
  if (typeof url !== 'string') return false
  return openLinkExternally(url)
})

/** 保存预览中导出的图片（Mermaid 图表下载） */
registerHandle(
  'dialog:saveImage',
  async (event, fileName: string, data: Uint8Array, extension: 'svg' | 'png') => {
    const parent = windowForSender(event)
    if (!parent) return null
    const result = await dialog.showSaveDialog(parent, {
      defaultPath: fileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(data))
    return result.filePath
  }
)

/** 会话（标签页）读写：每个编辑窗口只读写自己的切片 */
registerHandle('session:load', (event) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return null
  return sessionWindows.get(context.id) ?? null
})

registerHandle('session:save', (event, data: unknown) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return false
  const parsed = parseSessionData(data)
  if (!parsed) return false
  sessionWindows.set(context.id, parsed)
  queuePersistSessionFile()
  return true
})

registerHandle('history:load', (event) => {
  const context = getEditorWindowBySender(event.sender)
  return context ? (editorHistoryFileData.windows[context.id] ?? {}) : {}
})

registerHandle('history:save', async (event, entries: unknown) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return false
  editorHistoryFileData.windows[context.id] = capHistoryEntries(entries)
  try {
    await persistEditorHistoryFile()
    return true
  } catch (err) {
    console.error('Failed to save editor history:', err)
    return false
  }
})

registerHandle('integration:detect-vscode', async (event) => {
  if (!isEditorWindowSender(event.sender) && !isSettingsWindowSender(event.sender)) return []
  return detectVSCodeInstallations({ runtime: getVSCodeIntegrationRuntime() })
})

registerHandle('integration:install-vscode', async (event, variant: unknown) => {
  if (!isEditorWindowSender(event.sender) && !isSettingsWindowSender(event.sender)) {
    return { ok: false, error: '不允许的调用来源', needsRestart: false }
  }
  if (variant !== 'stable' && variant !== 'insiders') {
    return { ok: false, error: '不支持的 VSCode 类型', needsRestart: false }
  }
  return installVSCodeExtension(variant, { runtime: getVSCodeIntegrationRuntime() })
})

registerHandle('integration:uninstall-vscode', async (event, variant: unknown) => {
  if (!isEditorWindowSender(event.sender) && !isSettingsWindowSender(event.sender)) {
    return { ok: false, error: '不允许的调用来源', needsRestart: false }
  }
  if (variant !== 'stable' && variant !== 'insiders') {
    return { ok: false, error: '不支持的 VSCode 类型', needsRestart: false }
  }
  return uninstallVSCodeExtension(variant, { runtime: getVSCodeIntegrationRuntime() })
})

/** 只选择另存为路径，不写盘；渲染进程确认目标未被其他标签占用后再调用 file:save */
registerHandle('dialog:savePath', async (event, defaultFileName?: string) => {
  const parent = windowForSender(event)
  if (!parent) return null
  const result = await dialog.showSaveDialog(parent, {
    defaultPath: sanitizeFileName(defaultFileName || 'untitled.md', 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

/**
 * 三档页边距（英寸）。
 * Electron / Chromium 的 printToPDF.margins 实际按英寸处理（与典型 d.ts 注释不一致），
 * 传像素值会触发「margins must be less than or equal to pageSize」。
 */
const PDF_MARGIN_INCH: Record<PdfExportOptions['margin'], number> = {
  narrow: 0.4,
  standard: 0.65,
  wide: 0.9
}

/** 页脚页码占用的额外底部空间（英寸），避免页码与正文重叠 */
const PDF_FOOTER_HEIGHT_INCH = 0.18
/** 隐藏窗口等待字体 / 布局稳定的兜底上限（正常情况会提前完成） */
const PDF_LAYOUT_TIMEOUT_MS = 1500
/** 自包含 HTML 的硬上限，超过时直接提示，避免隐藏窗口因内存压力崩溃 */
const PDF_HTML_MAX_BYTES = 64 * 1024 * 1024
/** 长图等待网络图片、字体与布局稳定的兜底上限 */
const IMAGE_LAYOUT_TIMEOUT_MS = 4000
const IMAGE_LOAD_TIMEOUT_MS = 30_000
const IMAGE_INSPECT_TIMEOUT_MS = 10_000
const IMAGE_CAPTURE_TIMEOUT_MS = 60_000
/** 长图自包含 HTML 与 PDF 使用同一保守体积上限 */
const IMAGE_HTML_MAX_BYTES = 64 * 1024 * 1024

/** 保存对话框的默认路径：优先定位到当前文档所在目录，文件名永不为空 */
function buildPdfDefaultPath(fileName: string, sourcePath: string | null | undefined): string {
  const base = sanitizeFileName(fileName || 'untitled.pdf', 'pdf')
  if (!sourcePath) return base
  const dir = dirname(sourcePath)
  return dir && dir !== '.' ? join(dir, base) : base
}

function buildImageDefaultPath(
  fileName: string,
  sourcePath: string | null | undefined,
  format: ImageExportFormat
): string {
  const extension = imageExtensionFor(format)
  const base = ensureImageFileExtension(
    sanitizeFileName(fileName || `untitled.${extension}`, extension),
    format
  )
  if (!sourcePath) return base
  const dir = dirname(sourcePath)
  return dir && dir !== '.' ? join(dir, base) : base
}

interface ImagePageSize {
  width: number
  height: number
}

const IMAGE_PAGE_MEASURE_SCRIPT = `(() => {
  const page = document.querySelector('.image-export-page')
  const rect = page ? page.getBoundingClientRect() : null
  return {
    width: Math.ceil(rect ? rect.width : document.documentElement.scrollWidth),
    height: Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      rect ? rect.height : 0
    ))
  }
})()`
const IMAGE_WAIT_FRAMES_SCRIPT =
  'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'

async function measureImageExportPage(win: BrowserWindow): Promise<ImagePageSize> {
  return withTimeout(
    win.webContents.executeJavaScript(IMAGE_PAGE_MEASURE_SCRIPT) as Promise<ImagePageSize>,
    IMAGE_INSPECT_TIMEOUT_MS,
    '图片导出页面测量超时'
  )
}

async function waitForImageExportLayout(win: BrowserWindow): Promise<void> {
  await withTimeout(
    win.webContents.executeJavaScript(IMAGE_WAIT_FRAMES_SCRIPT) as Promise<void>,
    IMAGE_INSPECT_TIMEOUT_MS,
    '图片导出页面布局超时'
  )
}

registerHandle(
  'export:pdf',
  async (event, html: string, options: PdfExportOptions, requestId: string) => {
    const parent = windowForSender(event)
    if (!parent) return null
    const reportProgress = createExportProgressReporter(event, requestId, 'pdf')
    reportProgress(10, '准备导出')
    const result = await dialog.showSaveDialog(parent, {
      defaultPath: buildPdfDefaultPath(options.fileName, options.sourcePath),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null

    const htmlBytes = Buffer.byteLength(html, 'utf8')
    if (htmlBytes > PDF_HTML_MAX_BYTES) {
      const message = `PDF 内容过大（${(htmlBytes / 1024 / 1024).toFixed(1)} MB），请减少内嵌图片后重试`
      dialog.showErrorBox('PDF 导出失败', message)
      throw new Error(message)
    }

    const pdfWin = new BrowserWindow({
      width: 800,
      height: 1100,
      show: false,
      webPreferences: {
        sandbox: false,
        backgroundThrottling: false
      }
    })
    // 写入临时文件后 loadFile，避免超大内容塞进 data: URL 触发长度 / 内存问题
    const tempHtmlPath = join(app.getPath('temp'), `markit-pdf-${randomUUID()}.html`)

    try {
      await writeFile(tempHtmlPath, html, 'utf-8')
      reportProgress(15, '加载页面')
      await pdfWin.loadFile(tempHtmlPath)
      reportProgress(30, '等待图片与字体')
      // 等待图片、字体与两帧布局稳定；固定延时只作为兜底上限
      const layoutReady = pdfWin.webContents
        .executeJavaScript(
          `(async () => {
          await Promise.all(Array.from(document.images).map((img) =>
            img.complete
              ? null
              : new Promise((resolve) => {
                  img.addEventListener('load', resolve, { once: true })
                  img.addEventListener('error', resolve, { once: true })
                })
          ))
          if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready } catch {}
          }
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
        })()`
        )
        .catch((err) => {
          console.error('Failed to wait for PDF layout:', err)
        })
      await Promise.race([
        layoutReady,
        new Promise((resolve) => setTimeout(resolve, PDF_LAYOUT_TIMEOUT_MS))
      ])

      const margin = PDF_MARGIN_INCH[options.margin] ?? PDF_MARGIN_INCH.standard
      reportProgress(50, '生成 PDF')
      const pdf = await pdfWin.webContents.printToPDF({
        pageSize: options.pageSize === 'Letter' ? 'Letter' : 'A4',
        printBackground: true,
        margins: {
          marginType: 'custom',
          top: margin,
          bottom: margin + (options.showPageNumbers ? PDF_FOOTER_HEIGHT_INCH : 0),
          left: margin,
          right: margin
        },
        displayHeaderFooter: options.showPageNumbers,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-size:9px;color:#888;text-align:center;' +
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\">" +
          '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      })

      reportProgress(85, '写入文件')
      await writeFile(result.filePath, pdf)
      reportProgress(100, '完成')
      return result.filePath
    } finally {
      // 无论成功、取消还是打印异常，都不能残留隐藏窗口与临时文件
      if (!pdfWin.isDestroyed()) pdfWin.destroy()
      await rm(tempHtmlPath, { force: true }).catch((err) => {
        console.error('Failed to remove PDF temp file:', tempHtmlPath, err)
      })
    }
  }
)

registerHandle(
  'export:image',
  async (event, html: string, options: ImageExportOptions, requestId: string) => {
    const parent = windowForSender(event)
    if (!parent) return null
    const reportProgress = createExportProgressReporter(event, requestId, 'image')
    reportProgress(10, '准备导出')
    if (typeof html !== 'string' || !options || typeof options !== 'object') {
      throw new Error('图片导出参数无效')
    }
    if (options.format !== 'png' && options.format !== 'jpeg') {
      throw new Error('不支持的图片导出格式')
    }

    const format: ImageExportFormat = options.format
    const contentWidth = [640, 800, 1000, 1200].includes(options.contentWidth)
      ? options.contentWidth
      : 800
    const requestedScale = options.scale === 1 ? 1 : 2

    const result = await dialog.showSaveDialog(parent, {
      defaultPath: buildImageDefaultPath(options.fileName, options.sourcePath, format),
      filters: [
        format === 'jpeg'
          ? { name: 'JPEG', extensions: ['jpg', 'jpeg'] }
          : { name: 'PNG', extensions: ['png'] }
      ]
    })
    if (result.canceled || !result.filePath) return null
    const outputPath = ensureImageFileExtension(result.filePath, format)

    const htmlBytes = Buffer.byteLength(html, 'utf8')
    if (htmlBytes > IMAGE_HTML_MAX_BYTES) {
      const message = `图片内容过大（${(htmlBytes / 1024 / 1024).toFixed(
        1
      )} MB），请减少内嵌图片后重试`
      dialog.showErrorBox('图片导出失败', message)
      throw new Error(message)
    }

    const imageWin = new BrowserWindow({
      width: Math.max(900, contentWidth + 120),
      height: 1100,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    const tempHtmlPath = join(app.getPath('temp'), `markit-image-${randomUUID()}.html`)

    try {
      await writeFile(tempHtmlPath, html, 'utf-8')
      reportProgress(15, '加载页面')
      await withTimeout(
        imageWin.loadFile(tempHtmlPath),
        IMAGE_LOAD_TIMEOUT_MS,
        '图片导出页面加载超时'
      )
      reportProgress(30, '等待图片与字体')

      const layoutReady = imageWin.webContents
        .executeJavaScript(
          `(async () => {
            await Promise.all(Array.from(document.images).map((img) =>
              img.complete
                ? null
                : new Promise((resolve) => {
                    img.addEventListener('load', resolve, { once: true })
                    img.addEventListener('error', resolve, { once: true })
                  })
            ))
            if (document.fonts && document.fonts.ready) {
              try { await document.fonts.ready } catch {}
            }
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
          })()`
        )
        .catch((err) => {
          console.error('Failed to wait for image export layout:', err)
        })
      await Promise.race([
        layoutReady,
        new Promise((resolve) => setTimeout(resolve, IMAGE_LAYOUT_TIMEOUT_MS))
      ])

      reportProgress(45, '测量版面')
      let size = await measureImageExportPage(imageWin)

      const scale = resolveImageCaptureScale(size.width, size.height, requestedScale)
      reportProgress(60, '生成图片')
      imageWin.webContents.setZoomFactor(scale)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        imageWin.setContentSize(Math.ceil(size.width * scale), Math.ceil(size.height * scale))
        await waitForImageExportLayout(imageWin)
        size = await measureImageExportPage(imageWin)
      }

      const expectedWidth = Math.ceil(size.width * scale)
      const expectedHeight = Math.ceil(size.height * scale)
      const [contentWidth, contentHeight] = imageWin.getContentSize()
      if (expectedWidth > contentWidth || expectedHeight > contentHeight) {
        throw new Error('图片导出窗口无法容纳完整长图，请缩短文档或降低导出倍率后重试')
      }

      const screenshot = await withTimeout(
        imageWin.webContents.capturePage(),
        IMAGE_CAPTURE_TIMEOUT_MS,
        '图片生成超时，请缩短文档或降低导出倍率后重试'
      )
      const capturedSize = screenshot.getSize()
      if (capturedSize.width < expectedWidth || capturedSize.height < expectedHeight) {
        throw new Error('图片截图未覆盖完整页面，请缩短文档或降低导出倍率后重试')
      }

      const output =
        capturedSize.width === expectedWidth && capturedSize.height === expectedHeight
          ? screenshot
          : screenshot.resize({
              width: expectedWidth,
              height: expectedHeight,
              quality: 'best'
            })
      const imageData = format === 'jpeg' ? output.toJPEG(92) : output.toPNG()

      reportProgress(85, '写入文件')
      await writeFile(outputPath, imageData)
      reportProgress(100, '完成')
      return createImageExportResult(
        outputPath,
        format,
        requestedScale,
        scale,
        size.width,
        size.height
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      dialog.showErrorBox('图片导出失败', message)
      throw err
    } finally {
      if (!imageWin.isDestroyed()) imageWin.destroy()
      await rm(tempHtmlPath, { force: true }).catch((err) => {
        console.error('Failed to remove image export temp file:', tempHtmlPath, err)
      })
    }
  }
)

registerHandle('window:is-fullscreen', (event) => {
  const context = getEditorWindowBySender(event.sender)
  return context?.win.isFullScreen() ?? false
})
registerHandle('window:get-zoom', (event) => {
  if (!getEditorWindowBySender(event.sender) && !isSettingsWindowSender(event.sender)) return 1
  return globalZoomFactor
})
/** 设置全局缩放比例；由状态栏或设置页调用，归一与夹取仍由主进程负责 */
registerHandle('window:set-zoom', (event, factor: unknown) => {
  if (!getEditorWindowBySender(event.sender) && !isSettingsWindowSender(event.sender)) return false
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return false
  applyZoomFactor(factor)
  return true
})
/**
 * 同步原生外观主题。Chromium 依据 nativeTheme 的明暗选择窗口按钮的
 * hover 对比色：UI 是浅色而系统是深色时，hover 会被画成不可见的白色叠加。
 * 因此把用户选择的 themeMode 传给 nativeTheme（system 保持跟随系统）。
 * macOS 使用系统交通灯，无需处理。
 */
registerHandle('window:set-native-theme', (event, theme: 'light' | 'dark' | 'system') => {
  if (
    (!isEditorWindowSender(event.sender) && !isSettingsWindowSender(event.sender)) ||
    process.platform === 'darwin'
  ) {
    return
  }
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') return
  nativeTheme.themeSource = theme
})
registerHandle('settings:open', (event) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return false
  openSettingsWindow(source.win)
  return true
})
registerHandle('window:get-context', (event): RendererWindowContext | null => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return null
  return { id: context.id, pendingTransferId: context.pendingTransferId }
})
registerHandle('window:create', (event) => {
  const source = BrowserWindow.fromWebContents(event.sender)
  if (!source || (!isEditorWindowSender(event.sender) && !isSettingsWindowSender(event.sender))) {
    return false
  }
  return !!createEditorWindow({ source, initialSession: createBlankSession() })
})
registerHandle('window:move-tab-to-new', (event, payload: unknown) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return null
  return moveTabToNewWindow(source, payload)
})
registerHandle('window:move-tab-to-target', (event, payload: unknown, options: unknown) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return null
  return moveTabToTargetWindow(source, payload, options)
})
registerHandle('window:move-tab-to-window', (event, payload: unknown, windowId: unknown) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return null
  return moveTabToWindow(source, payload, windowId)
})
registerHandle('window:list', (event): EditorWindowSummary[] => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return []
  const contexts = Array.from(editorWindows.values())
  return contexts.flatMap((context, index) =>
    context.id === source.id || context.win.isDestroyed()
      ? []
      : [{ id: context.id, title: `窗口 ${index + 1}` }]
  )
})
registerHandle('window:take-pending-transfer', (event) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context || !context.pendingTransferId) return null
  return context.pendingIncomingTransfer
})
registerOn('window:ack-tab-transfer', (event, transferId: unknown) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context || typeof transferId !== 'string') return
  if (context.pendingTransferId !== transferId) return
  const transfer = pendingTabTransfers.get(transferId)
  if (!transfer || transfer.targetWindowId !== context.id) return

  clearTimeout(transfer.timeout)
  pendingTabTransfers.delete(transferId)
  context.pendingTransferId = null
  context.pendingIncomingTransfer = null
  transfer.resolve({
    transferId,
    windowId: transfer.targetWindowId,
    mode: transfer.targetCreated ? 'new' : 'existing'
  })
  queuePersistSessionFile()
})
registerOn('window:reject-tab-transfer', (event, transferId: unknown) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context || typeof transferId !== 'string') return
  const transfer = pendingTabTransfers.get(transferId)
  if (!transfer || transfer.targetWindowId !== context.id) return
  notifyTabTransferFailure(transferId)
})
registerOn('window:tab-drag-start', (event, tabName: unknown, theme: unknown) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source || typeof tabName !== 'string') return
  startTabDrag(source, tabName, theme === 'light' ? 'light' : 'dark')
})
registerOn('window:tab-drag-move', (event) => {
  const source = getEditorWindowBySender(event.sender)
  if (!source) return
  handleTabDragMove(source)
})
registerOn('window:tab-drag-end', (event) => {
  if (!getEditorWindowBySender(event.sender)) return
  clearTabDragHighlight()
})
registerOn('app:prepare-exit-result', (event, payload: unknown) => {
  if (!isEditorWindowSender(event.sender)) return
  if (!payload || typeof payload !== 'object') return
  const result = payload as Partial<ExitPreparationResult>
  if (typeof result.requestId !== 'string' || typeof result.ok !== 'boolean') return
  const preparation = pendingExitPreparations.get(result.requestId)
  if (!preparation) return

  preparation.pendingWebContents.delete(event.sender.id)
  if (!result.ok) {
    pendingExitPreparations.delete(result.requestId)
    preparation.resolve(false)
    return
  }
  if (preparation.pendingWebContents.size === 0) {
    pendingExitPreparations.delete(result.requestId)
    preparation.resolve(true)
  }
})
registerHandle('window:close', (event) => {
  const context = getEditorWindowBySender(event.sender)
  if (!context) return false
  context.allowClose = true
  context.win.close()
  return true
})

// --- App lifecycle ---

function createInitialEditorWindows(): void {
  const restoredIds = Array.from(sessionWindows.keys()).slice(0, MAX_RESTORED_WINDOWS)
  if (restoredIds.length === 0) {
    const id = lastFocusedWindowId ?? randomUUID()
    lastFocusedWindowId = id
    createEditorWindow({ id })
    return
  }
  for (const id of restoredIds) createEditorWindow({ id })
}

function ensureEditorWindow(): EditorWindowContext | null {
  return getFocusedEditorWindow() ?? createEditorWindow()
}

// 单实例锁：如果已有实例在运行，将文件路径转发给已有实例
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  // 第二次启动时，把命令行参数中的文件路径发给已有实例
  app.on('second-instance', (_e, argv) => {
    const filePaths = extractFilePaths(argv)
    const target = ensureEditorWindow()
    if (target) focusEditorWindow(target)
    if (filePaths.length > 0 && target) void openFilesAtPaths(filePaths, target)
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.harley.markit')

    // 预览中的相对路径图片：markit-file://local/?p=<绝对路径>
    protocol.handle(LOCAL_FILE_SCHEME, (request) => {
      try {
        const filePath = new URL(request.url).searchParams.get('p')
        if (!filePath) return new Response('Missing path', { status: 400 })
        if (!IMAGE_FILE_EXTENSION.test(filePath)) {
          return new Response('Unsupported file type', { status: 415 })
        }
        return net.fetch(pathToFileURL(filePath).toString())
      } catch (err) {
        console.error('Failed to load local image:', err)
        return new Response('Not found', { status: 404 })
      }
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initializePersistedState()
    initActivityReporter()
    createInitialEditorWindows()

    void writeVSCodeIntegrationConfig(getVSCodeIntegrationRuntime()).catch((error) => {
      console.warn('Failed to update VSCode integration config:', error)
    })

    // 自动更新：先由主进程协调所有编辑窗口保存，再放行退出安装。
    initAutoUpdater({
      isEditorWindowSender,
      requestInstall: prepareForInstall,
      beforeInstall: () => {
        appQuitAllowed = true
        setAllEditorWindowsReadyToClose()
      },
      onInstallFailed: () => {
        appQuitAllowed = false
        for (const context of editorWindows.values()) context.allowClose = false
      }
    })

    // 每 300ms 将真实光标位置换算为页面坐标推送给渲染进程。
    // 鼠标移入标题栏拖拽区 (-webkit-app-region: drag) 或窗口外时，
    // 渲染进程收不到任何鼠标事件，CSS :hover / mousemove 都会卡住，
    // 只有主进程能拿到可靠的地面真值（用于滚动条悬停状态自愈）。
    setInterval(() => {
      const cursor = screen.getCursorScreenPoint()
      for (const context of editorWindows.values()) {
        if (context.win.isDestroyed() || !context.win.isVisible()) continue
        const bounds = context.win.getContentBounds()
        context.win.webContents.send('cursor-pos', {
          x: (cursor.x - bounds.x) / globalZoomFactor,
          y: (cursor.y - bounds.y) / globalZoomFactor
        })
      }
    }, 300)

    // 处理首次启动时的命令行文件参数（页面未加载完成时由 openFileAtPath 暂存）
    const startupFiles = [...preReadyFilePaths.splice(0), ...extractFilePaths(process.argv)]
    if (startupFiles.length > 0)
      void openFilesAtPaths(startupFiles, ensureEditorWindow() ?? undefined)

    app.on('activate', function () {
      if (editorWindows.size === 0) createInitialEditorWindows()
    })
  })
}

// 退出应用时协调所有编辑窗口，而不是假定只有一个主窗口。
app.on('before-quit', (event) => {
  if (activeTabDrag) clearTabDragHighlight()
  if (appQuitAllowed || editorWindows.size === 0) return
  event.preventDefault()
  if (quitPreparationInProgress) return
  quitPreparationInProgress = true
  void requestEditorPreparation('quit').then((prepared) => {
    quitPreparationInProgress = false
    if (!prepared) return
    appQuitAllowed = true
    setAllEditorWindowsReadyToClose()
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
