import { app, shell, BrowserWindow, ipcMain, dialog, screen, protocol, net } from 'electron'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initAutoUpdater } from './updater'

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

let mainWindow: BrowserWindow | null = null
const pendingFilePaths: string[] = []
/**
 * 渲染进程是否已注册文件打开监听（收到 renderer:ready 前一律排队）。
 * 不能用 webContents.isLoading() 判断：Electron 的 did-finish-load 触发时
 * isLoading() 仍可能为 true，此时发送会丢失/再次排队，表现为「首次双击
 * 打开文件时只恢复上次会话标签，文件未打开」
 */
let rendererReady = false
let allowClose = false

// --- 窗口大小/位置记忆 ---

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
  /** 页面缩放比例（1 表示 100%） */
  zoomFactor: number
}

// --- 整窗缩放 ---

const ZOOM_STEP = 0.1
const MIN_ZOOM_FACTOR = 0.5
const MAX_ZOOM_FACTOR = 3
/** 当前缩放比例，主进程为准（页面重载会重置 webContents 的缩放，需要据此恢复） */
let currentZoomFactor = 1

/** 归一到 10% 步长并限制在允许范围内 */
function normalizeZoomFactor(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, Math.round(value * 10) / 10))
}

const windowStateFile = join(app.getPath('userData'), 'window-state.json')
/** 上次打开的标签页（含未保存内容），更新重启后据此恢复文档 */
const sessionFile = join(app.getPath('userData'), 'session.json')
const defaultWindowState: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false,
  zoomFactor: 1
}
let saveStateTimer: ReturnType<typeof setTimeout> | null = null

function loadWindowState(): WindowState {
  try {
    if (!existsSync(windowStateFile)) return { ...defaultWindowState }
    const state = JSON.parse(readFileSync(windowStateFile, 'utf-8')) as Partial<WindowState>
    if (
      typeof state.width !== 'number' ||
      !Number.isFinite(state.width) ||
      typeof state.height !== 'number' ||
      !Number.isFinite(state.height)
    ) {
      return { ...defaultWindowState }
    }

    const result: WindowState = {
      // 不小于窗口最小尺寸限制
      width: Math.max(800, state.width),
      height: Math.max(600, state.height),
      zoomFactor: normalizeZoomFactor(typeof state.zoomFactor === 'number' ? state.zoomFactor : 1),
      isMaximized: state.isMaximized === true
    }

    const savedX = typeof state.x === 'number' ? state.x : NaN
    const savedY = typeof state.y === 'number' ? state.y : NaN
    if (Number.isFinite(savedX) && Number.isFinite(savedY)) {
      // 校验窗口仍在已连接的显示器范围内（拔掉显示器后旧坐标可能位于屏幕外）
      const wa = screen.getDisplayMatching({
        x: savedX,
        y: savedY,
        width: result.width,
        height: result.height
      }).workArea
      if (
        savedX < wa.x + wa.width &&
        savedX + result.width > wa.x &&
        savedY < wa.y + wa.height &&
        savedY + result.height > wa.y
      ) {
        result.x = savedX
        result.y = savedY
      }
    }
    return result
  } catch (err) {
    console.error('Failed to load window state:', err)
    return { ...defaultWindowState }
  }
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // 最大化时保存还原后的普通尺寸，下次启动再恢复最大化状态
  const bounds = mainWindow.getNormalBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    zoomFactor: currentZoomFactor,
    isMaximized: mainWindow.isMaximized()
  }
  writeFile(windowStateFile, JSON.stringify(state), 'utf-8').catch((err) => {
    console.error('Failed to save window state:', err)
  })
}

function queueSaveWindowState(): void {
  if (saveStateTimer) clearTimeout(saveStateTimer)
  saveStateTimer = setTimeout(saveWindowState, 500)
}

/** 应用缩放比例（整个页面一起缩放）并通知渲染进程、持久化 */
function applyZoomFactor(factor: number): void {
  currentZoomFactor = normalizeZoomFactor(factor)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(currentZoomFactor)
    mainWindow.webContents.send('window:zoom-changed', currentZoomFactor)
  }
  queueSaveWindowState()
}

function zoomBy(delta: number): void {
  applyZoomFactor(currentZoomFactor + delta)
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

/**
 * 打开指定文件：读取内容并发送到渲染进程。
 * 渲染进程注册好监听（renderer:ready）前先缓存到 pendingFilePaths，
 * 否则「用 MarkIt 打开」在启动瞬间/二次启动时会丢失（表现为新文档没有打开）
 */
async function openFileAtPath(filePath: string): Promise<void> {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) {
    if (!pendingFilePaths.includes(filePath)) pendingFilePaths.push(filePath)
    return
  }
  try {
    const content = await readFile(filePath, 'utf-8')
    // 读取期间页面可能开始重载，此时发送会丢，重新排队等下一次 ready
    if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) {
      if (!pendingFilePaths.includes(filePath)) pendingFilePaths.push(filePath)
      return
    }
    mainWindow.webContents.send('open-file-from-argv', { path: filePath, content })
  } catch (err) {
    console.error('Failed to open file from argv:', err)
  }
}

/** 按传入顺序依次打开（多个文件时最后一个是激活标签） */
async function openFilesAtPaths(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    await openFileAtPath(filePath)
  }
}

function createWindow(): void {
  const windowState = loadWindowState()
  const isMac = process.platform === 'darwin'
  currentZoomFactor = windowState.zoomFactor
  // 新窗口的渲染进程尚未注册监听，恢复打开的文件需重新排队等待 ready
  rendererReady = false

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x !== undefined && windowState.y !== undefined
      ? { x: windowState.x, y: windowState.y }
      : {}),
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // macOS 需要保留窗口边框才能显示交通灯，不能使用 frame: false；
    // Windows/Linux 使用无边框窗口 + 系统窗口按钮 overlay
    ...(isMac
      ? {
          titleBarStyle: 'hidden',
          // 与 36px 标题栏垂直居中
          trafficLightPosition: { x: 16, y: 12 }
        }
      : {
          frame: false,
          titleBarStyle: 'hidden',
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

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // 键盘事件先于页面和菜单快捷键到达这里：
  // 1) macOS 默认菜单的 Cmd+W 会关闭窗口并吞掉渲染进程的 keydown，
  //    拦截后转交渲染进程关闭当前标签页；
  // 2) 整窗缩放 Ctrl/Cmd + = / -，Ctrl/Cmd + 0 恢复 100%。
  mainWindow.webContents.on('before-input-event', (event, input) => {
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
      mainWindow?.webContents.send('shortcut:close-tab')
      return
    }

    // macOS 用 Cmd，Windows/Linux 用 Ctrl
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

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen', false)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // 窗口尺寸/位置变化时防抖保存；关闭时兜底保存一次
  mainWindow.on('resize', queueSaveWindowState)
  mainWindow.on('move', queueSaveWindowState)
  mainWindow.on('close', saveWindowState)

  // 窗口关闭前询问渲染进程是否有未保存修改
  mainWindow.on('close', (e) => {
    if (allowClose) return
    if (mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault()
      mainWindow.webContents.send('window:close-request')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openLinkExternally(details.url)
    return { action: 'deny' }
  })

  // 兜底：预览中的链接若没被渲染进程拦截，也不能把主窗口导航到外部地址
  // （导航后应用界面丢失且无法返回，表现为窗口卡死）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openLinkExternally(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 页面重载后渲染进程的监听会丢失，需等待它重新上报 ready 再放行排队文件
  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  mainWindow.webContents.on('did-finish-load', () => {
    // 页面加载后恢复缩放比例（刷新/重载会把 webContents 的缩放重置为 100%）
    mainWindow?.webContents.setZoomFactor(currentZoomFactor)
    mainWindow?.webContents.send('window:zoom-changed', currentZoomFactor)
  })
}

// --- 文档内链接处理 ---

/** 允许交给系统默认程序打开的外部协议 */
const EXTERNAL_LINK_PROTOCOL = /^(?:https?|mailto):$/i

/** 应用自身页面地址（只有这类导航可以留在主窗口内） */
function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devUrl) return url.startsWith(devUrl)
  return url.startsWith(pathToFileURL(join(__dirname, '../renderer/')).href)
}

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
    // 非法地址直接忽略，绝不交给主窗口导航
  }
  return false
}

// --- IPC handlers ---

/**
 * 渲染进程已注册文件打开监听。此前排队的文件（首次启动的命令行参数、
 * 启动期间到达的 second-instance 文件）在这里统一放行
 */
ipcMain.on('renderer:ready', () => {
  rendererReady = true
  const queued = pendingFilePaths.splice(0)
  if (queued.length > 0) void openFilesAtPaths(queued)
})

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return []

  const files: { path: string; content: string }[] = []
  for (const filePath of result.filePaths) {
    try {
      files.push({ path: filePath, content: await readFile(filePath, 'utf-8') })
    } catch (err) {
      console.error('Failed to read file:', filePath, err)
    }
  }
  return files
})

ipcMain.handle('file:save', async (_e, filePath: string, content: string) => {
  await writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('file:read', async (_e, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { path: filePath, content }
  } catch (err) {
    console.error('Failed to read file:', err)
    return null
  }
})

/** 在系统文件管理器中定位文件；文件已被删除时退回到所在目录 */
ipcMain.handle('file:reveal', (_e, filePath: string) => {
  if (typeof filePath !== 'string') return false
  return revealPath(filePath)
})

/** 用系统默认程序打开外部链接（仅 http/https/mailto，其余协议忽略） */
ipcMain.handle('shell:openExternal', (_e, url: string) => {
  if (typeof url !== 'string') return false
  return openLinkExternally(url)
})

/** 保存预览中导出的图片（Mermaid 图表下载） */
ipcMain.handle(
  'dialog:saveImage',
  async (_e, fileName: string, data: Uint8Array, extension: 'svg' | 'png') => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: fileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(data))
    return result.filePath
  }
)

/** 会话（标签页）读写：用于更新重启后恢复上次打开的文档 */
ipcMain.handle('session:load', async () => {
  try {
    if (!existsSync(sessionFile)) return null
    return JSON.parse(await readFile(sessionFile, 'utf-8'))
  } catch (err) {
    console.error('Failed to load session:', err)
    return null
  }
})

ipcMain.handle('session:save', async (_e, data: unknown) => {
  try {
    await writeFile(sessionFile, JSON.stringify(data), 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to save session:', err)
    return false
  }
})

ipcMain.handle('dialog:saveFile', async (_e, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf-8')
  return result.filePath
})

ipcMain.handle(
  'export:pdf',
  async (
    _e,
    html: string,
    options: {
      pageSize: 'A4' | 'Letter'
      margin: 'narrow' | 'standard' | 'wide'
      showPageNumbers: boolean
    }
  ) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null

    const pdfWin = new BrowserWindow({
      width: 800,
      height: 1100,
      show: false,
      webPreferences: { sandbox: false }
    })

    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // 等待文档内图片加载完成，避免导出时图片还是空白
    await pdfWin.webContents.executeJavaScript(
      `Promise.all(Array.from(document.images).map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true })
              img.addEventListener('error', resolve, { once: true })
            })
      ))`
    )
    await new Promise((r) => setTimeout(r, 1500))

    const sizeMap: Record<string, 'A4' | 'Letter'> = { A4: 'A4', Letter: 'Letter' }
    const pdf = await pdfWin.webContents.printToPDF({
      pageSize: sizeMap[options.pageSize] ?? 'A4',
      printBackground: true
    })

    pdfWin.close()
    await writeFile(result.filePath, pdf)
    return result.filePath
  }
)

ipcMain.handle('window:is-fullscreen', () => mainWindow?.isFullScreen() ?? false)
ipcMain.handle('window:get-zoom', () => currentZoomFactor)
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => {
  allowClose = true
  mainWindow?.close()
})

// --- App lifecycle ---

// 单实例锁：如果已有实例在运行，将文件路径转发给已有实例
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  // 第二次启动时，把命令行参数中的文件路径发给已有实例
  app.on('second-instance', (_e, argv) => {
    const filePaths = extractFilePaths(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (filePaths.length > 0) {
        openFilesAtPaths(filePaths)
      }
    }
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

    createWindow()

    // 自动更新：安装前放行关闭守卫（窗口 close 事件默认会被拦截）
    initAutoUpdater({
      beforeInstall: () => {
        allowClose = true
      },
      getMainWindow: () => mainWindow
    })

    // 每 300ms 将真实光标位置换算为页面坐标推送给渲染进程。
    // 鼠标移入标题栏拖拽区 (-webkit-app-region: drag) 或窗口外时，
    // 渲染进程收不到任何鼠标事件，CSS :hover / mousemove 都会卡住，
    // 只有主进程能拿到可靠的地面真值（用于滚动条悬停状态自愈）。
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
      const cursor = screen.getCursorScreenPoint()
      const bounds = mainWindow.getContentBounds()
      const zoom = mainWindow.webContents.getZoomFactor()
      mainWindow.webContents.send('cursor-pos', {
        x: (cursor.x - bounds.x) / zoom,
        y: (cursor.y - bounds.y) / zoom
      })
    }, 300)

    // 处理首次启动时的命令行文件参数（页面未加载完成时由 openFileAtPath 暂存）
    openFilesAtPaths(extractFilePaths(process.argv))

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
