import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { UpdateState } from '../shared/update-types'
import type { SessionData } from '../shared/session-types'

const api = {
  /** 当前运行平台（渲染进程用于给系统窗口按钮留位） */
  platform: process.platform,
  /** 打开文件对话框，支持多选；返回每个文件的内容 */

  openFiles: (): Promise<{ path: string; content: string }[]> =>
    ipcRenderer.invoke('dialog:openFiles'),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  saveFileAs: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  /** 在系统文件管理器中定位当前文件 */
  showItemInFolder: (path: string): Promise<boolean> => ipcRenderer.invoke('file:reveal', path),
  /** 保存图片（Mermaid 图表下载），返回保存路径；用户取消时为 null */
  saveImage: (
    fileName: string,
    data: Uint8Array,
    extension: 'svg' | 'png'
  ): Promise<string | null> => ipcRenderer.invoke('dialog:saveImage', fileName, data, extension),
  exportPdf: (
    html: string,
    options: {
      pageSize: 'A4' | 'Letter'
      margin: 'narrow' | 'standard' | 'wide'
      showPageNumbers: boolean
    }
  ) => ipcRenderer.invoke('export:pdf', html, options),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  /** 当前整窗缩放比例（1 表示 100%） */
  getZoom: (): Promise<number> => ipcRenderer.invoke('window:get-zoom'),
  /** 监听整窗缩放比例变化（Ctrl/Cmd + = / - / 0） */
  onZoomChange: (callback: (factor: number) => void) => {
    ipcRenderer.on('window:zoom-changed', (_e, factor) => callback(factor))
  },
  /** 监听全屏状态变化（全屏时系统窗口按钮不可见，标题栏无需留位） */
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => {
    ipcRenderer.on('window:fullscreen', (_e, fullscreen) => callback(fullscreen))
  },
  /** macOS Cmd+W：主进程拦截菜单快捷键后转交渲染进程关闭标签页 */
  onCloseTabShortcut: (callback: () => void) => {
    ipcRenderer.on('shortcut:close-tab', () => callback())
  },
  /** 监听主进程发来的文件打开事件（右键打开 / 命令行传参） */
  onOpenFile: (callback: (result: { path: string; content: string }) => void) => {
    ipcRenderer.on('open-file-from-argv', (_e, data) => callback(data))
  },
  /** 监听窗口关闭请求（主进程 close 事件） */
  onCloseRequest: (callback: () => void) => {
    ipcRenderer.on('window:close-request', () => callback())
  },
  /** 主进程光标位置轮询（滚动条悬停状态判定兜底） */
  onCursorPos: (callback: (pos: { x: number; y: number }) => void) => {
    ipcRenderer.on('cursor-pos', (_e, pos) => callback(pos))
  },
  /** 会话读写（更新重启后恢复上次打开的标签页） */
  session: {
    load: (): Promise<SessionData | null> => ipcRenderer.invoke('session:load'),
    save: (data: SessionData): Promise<boolean> => ipcRenderer.invoke('session:save', data)
  },
  /** 自动更新：读取状态 / 检测 / 下载 / 安装 / 订阅状态变化 */
  update: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
    download: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    onState: (callback: (state: UpdateState) => void) => {
      ipcRenderer.on('update:state', (_e, state: UpdateState) => callback(state))
    }
  }
}

export type ExposedAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
