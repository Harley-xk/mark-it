/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 根据触发窗口所在显示器计算用户可见窗口的位置并统一激活单实例窗口
 */
import { BrowserWindow, screen } from 'electron'
import { centerWindowOnWorkArea } from './window-state-store'

export interface WindowPlacementSize {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
}

export interface WindowPlacement {
  width: number
  height: number
  minWidth: number
  minHeight: number
  x: number
  y: number
}

/**
 * 首次创建用户可见窗口时，跟随触发窗口所在显示器。
 * 没有触发窗口时退回到主显示器；显式传入的窗口必须由调用方从 IPC 发送方取得。
 */
export function resolveWindowPlacement(
  sourceWindow: BrowserWindow | null | undefined,
  size: WindowPlacementSize
): WindowPlacement {
  const display =
    sourceWindow && !sourceWindow.isDestroyed()
      ? screen.getDisplayMatching(sourceWindow.getBounds())
      : screen.getPrimaryDisplay()
  const placement = centerWindowOnWorkArea(display.workArea, size.width, size.height)
  return {
    ...placement,
    minWidth: Math.min(size.minWidth ?? size.width, placement.width),
    minHeight: Math.min(size.minHeight ?? size.height, placement.height)
  }
}

/** 恢复并聚焦已有单实例窗口，不改变窗口所在显示器或几何状态 */
export function activateWindow(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}
