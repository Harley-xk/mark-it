/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 独立设置窗口的单实例创建、聚焦与关闭管理
 */
import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let settingsWindow: BrowserWindow | null = null

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
}

export function isSettingsWindowSender(contents: WebContents): boolean {
  const win = getSettingsWindow()
  return !!win && win.webContents === contents
}

/**
 * 打开或聚焦全局设置窗口。
 * 设置窗口不属于编辑器窗口注册表，也不参与会话恢复。
 */
export function openSettingsWindow(): void {
  const existing = getSettingsWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }

  const isMac = process.platform === 'darwin'
  settingsWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    center: true,
    autoHideMenuBar: true,
    title: 'MarkIt 设置',
    backgroundColor: '#151922',
    ...(isMac
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 16, y: 10 }
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  settingsWindow.once('ready-to-show', () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return
    settingsWindow.show()
    settingsWindow.focus()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    void settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

/** 所有编辑窗口关闭或应用退出时，关闭设置工具窗口 */
export function closeSettingsWindow(): void {
  const win = getSettingsWindow()
  if (!win) return
  win.close()
}
