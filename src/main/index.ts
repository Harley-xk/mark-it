import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let pendingFilePath: string | null = null
let allowClose = false

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

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
