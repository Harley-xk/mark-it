/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 独立图表 / 图片预览窗口的单实例创建、载荷分发、聚焦与关闭
 */
import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { activateWindow, applyWindowPlacement, resolveWindowPlacement } from './window-placement'
import { isAppUrl } from './ipc-guard'
import { mt } from './i18n'
import type { PreviewWindowPayload } from '../shared/preview-types'

let previewWindow: BrowserWindow | null = null
let currentPayload: PreviewWindowPayload | null = null
/** 与主进程 globalZoomFactor 保持同步，页面重载后据此恢复 */
let currentZoomFactor = 1

export function getPreviewWindow(): BrowserWindow | null {
  return previewWindow && !previewWindow.isDestroyed() ? previewWindow : null
}

export function isPreviewWindowSender(contents: WebContents): boolean {
  const win = getPreviewWindow()
  return !!win && win.webContents === contents
}

export function previewWindowForSender(contents: WebContents): BrowserWindow | null {
  const win = getPreviewWindow()
  return win && win.webContents === contents ? win : null
}

/**
 * 打开或更新全局单实例预览窗口。
 * 首次创建跟随触发编辑窗口所在显示器；已有窗口只替换内容并聚焦，不移动。
 */
export function openPreviewWindow(
  sourceWindow: BrowserWindow | null,
  payload: PreviewWindowPayload,
  zoomFactor: number
): boolean {
  const existing = getPreviewWindow()
  currentPayload = payload
  currentZoomFactor = zoomFactor

  if (existing) {
    existing.webContents.setZoomFactor(zoomFactor)
    // 页面尚未加载完成时由 take-payload 取最新载荷；加载完成后再补发一次，避免监听注册晚于事件
    if (existing.webContents.isLoading()) {
      existing.webContents.once('did-finish-load', () => {
        if (previewWindow === existing && currentPayload) {
          existing.webContents.send('preview:payload', currentPayload)
        }
      })
    } else if (!existing.webContents.isDestroyed()) {
      existing.webContents.send('preview:payload', payload)
    }
    activateWindow(existing)
    return true
  }

  const isMac = process.platform === 'darwin'
  const placement = resolveWindowPlacement(sourceWindow, {
    width: 1120,
    height: 780,
    minWidth: 420,
    minHeight: 320
  })
  previewWindow = new BrowserWindow({
    ...placement,
    show: false,
    autoHideMenuBar: true,
    title: mt('window.previewTitle'),
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  // 混合缩放显示器下构造参数会被二次换算，创建后按 DIP 几何校正一次
  applyWindowPlacement(previewWindow, placement)
  previewWindow.webContents.setZoomFactor(zoomFactor)
  previewWindow.webContents.on('did-finish-load', () => {
    if (!previewWindow || previewWindow.isDestroyed()) return
    previewWindow.webContents.setZoomFactor(currentZoomFactor)
    previewWindow.webContents.send('window:zoom-changed', currentZoomFactor)
  })

  previewWindow.once('ready-to-show', () => {
    if (!previewWindow || previewWindow.isDestroyed()) return
    activateWindow(previewWindow)
  })

  previewWindow.on('closed', () => {
    previewWindow = null
    currentPayload = null
  })

  previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  previewWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/preview.html`)
  } else {
    void previewWindow.loadFile(join(__dirname, '../renderer/preview.html'))
  }
  return true
}

/** 预览窗口加载完成后取当前载荷；只接受预览窗口自身调用 */
export function takePreviewPayload(contents: WebContents): PreviewWindowPayload | null {
  return isPreviewWindowSender(contents) ? currentPayload : null
}

/** 同步全局窗口缩放比例；预览窗口未打开时忽略 */
export function setPreviewZoomFactor(factor: number): void {
  currentZoomFactor = factor
  const win = getPreviewWindow()
  if (!win || win.webContents.isDestroyed()) return
  win.webContents.setZoomFactor(factor)
  win.webContents.send('window:zoom-changed', factor)
}

/** 关闭预览窗口；不触及编辑窗口或应用退出流程 */
export function closePreviewWindow(): void {
  const win = getPreviewWindow()
  if (!win) return
  win.close()
}
