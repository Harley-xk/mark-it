import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let pendingFilePath: string | null = null
let allowClose = false

// --- 窗口大小/位置记忆 ---

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

const windowStateFile = join(app.getPath('userData'), 'window-state.json')
const defaultWindowState: WindowState = { width: 1280, height: 800, isMaximized: false }
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

/**
 * 从命令行参数中提取文件路径
 * 开发模式下跳过 electron-vite 注入的参数（以 -/ electron 开头的）
 */
function extractFilePath(argv: string[]): string | null {
  for (const arg of argv) {
    // 跳过选项参数和 electron 自身
    if (arg.startsWith('-') || arg === 'electron') continue
    // 跳过 .js/.ts 入口文件（electron-vite dev 模式）
    if (arg.endsWith('.js') || arg.endsWith('.ts')) continue
    // 绝对路径且文件存在 => 当作文件打开
    if (arg.includes(':') || arg.startsWith('/')) {
      if (arg.toLowerCase().endsWith('.md') || arg.toLowerCase().endsWith('.markdown') || arg.toLowerCase().endsWith('.txt')) {
        return arg
      }
    }
  }
  return null
}

/**
 * 打开指定文件：读取内容并发送到渲染进程
 */
async function openFileAtPath(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf-8')
    mainWindow?.webContents.send('open-file-from-argv', { path: filePath, content })
  } catch (err) {
    console.error('Failed to open file from argv:', err)
  }
}

function createWindow(): void {
  const windowState = loadWindowState()

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
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#888',
      height: 36
    },
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
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 窗口加载完毕后，打开待处理的文件
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFilePath) {
      openFileAtPath(pendingFilePath)
      pendingFilePath = null
    }
  })
}

// --- IPC handlers ---

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const content = await readFile(filePath, 'utf-8')
  return { path: filePath, content }
})

ipcMain.handle('file:save', async (_e, filePath: string, content: string) => {
  await writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('dialog:saveFile', async (_e, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf-8')
  return result.filePath
})

ipcMain.handle('export:pdf', async (_e, html: string, options: {
  pageSize: 'A4' | 'Letter'
  margin: 'narrow' | 'standard' | 'wide'
  showPageNumbers: boolean
}) => {
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
  await new Promise(r => setTimeout(r, 1500))

  const sizeMap: Record<string, 'A4' | 'Letter'> = { A4: 'A4', Letter: 'Letter' }
  const pdf = await pdfWin.webContents.printToPDF({
    pageSize: sizeMap[options.pageSize] ?? 'A4',
    printBackground: true
  })

  pdfWin.close()
  await writeFile(result.filePath, pdf)
  return result.filePath
})

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
    const filePath = extractFilePath(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (filePath) {
        openFileAtPath(filePath)
      }
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.mark-it')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    // 处理首次启动时的命令行文件参数
    const filePath = extractFilePath(process.argv)
    if (filePath) {
      // 如果窗口已加载完毕，直接打开；否则存为 pending
      if (mainWindow?.webContents.isLoading()) {
        pendingFilePath = filePath
      } else {
        openFileAtPath(filePath)
      }
    }

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
