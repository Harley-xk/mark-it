/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: IPC 调用来源校验与注册封装，只允许应用自身页面调用主进程能力
 */
import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'

/**
 * 应用自身页面地址（只有这类页面可以留在应用窗口内 / 调用 IPC）。
 * 开发模式按 origin 比较（避免 `http://localhost:5173.evil.com` 之类的前缀伪造），
 * 打包后比较渲染产物目录。
 */
export function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devUrl) {
    try {
      return new URL(url).origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  try {
    return new URL(url).pathname.startsWith(
      new URL(pathToFileURL(join(__dirname, '../renderer/')).href).pathname
    )
  } catch {
    return false
  }
}

/** 校验 IPC 调用是否来自应用自身页面（含编辑窗口与工具窗口） */
export function isTrustedIpcSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return typeof url === 'string' && isAppUrl(url)
}

/** 注册 invoke 通道，并拒绝非应用页面发起的调用 */
export function registerHandle<Args extends unknown[]>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      console.warn('Rejected IPC from untrusted sender:', channel, event.senderFrame?.url)
      throw new Error(`Untrusted IPC sender: ${channel}`)
    }
    return listener(event, ...(args as Args))
  })
}

/** 注册单向通道，并忽略非应用页面发起的调用 */
export function registerOn<Args extends unknown[]>(
  channel: string,
  listener: (event: IpcMainEvent, ...args: Args) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      console.warn('Rejected IPC from untrusted sender:', channel, event.senderFrame?.url)
      return
    }
    listener(event, ...(args as Args))
  })
}
