import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { UpdateState } from '../shared/update-types'

const api = {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  saveFileAs: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
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
