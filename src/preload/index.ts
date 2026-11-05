import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { UpdateState } from '../shared/update-types'
import type { SessionData } from '../shared/session-types'
import type { FileReadResult } from '../shared/file-types'
import type { PdfExportOptions } from '../shared/pdf-types'

/** 订阅主进程事件并返回注销函数，避免 HMR / 重复挂载时监听累积 */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/** 无载荷事件的订阅包装 */
function subscribeVoid(channel: string, callback: () => void): () => void {
  const listener = (): void => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/**
 * renderer:ready 只需上报一次。
 * 页面重载会重新执行 preload，标志随模块重新初始化，
 * 因此不会漏报新页面；同一页面重复注册监听也不会重复放行排队文件。
 */
let rendererReadyNotified = false

const api = {
  /** 当前运行平台（渲染进程用于给系统窗口按钮留位） */
  platform: process.platform,
  /** 打开文件对话框，支持多选；返回每个文件的内容 */
  openFiles: (): Promise<FileReadResult[]> => ipcRenderer.invoke('dialog:openFiles'),
  saveFile: (path: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('file:save', path, content),
  readFile: (path: string): Promise<FileReadResult | null> => ipcRenderer.invoke('file:read', path),
  /** 只监视当前活跃标签对应的磁盘文件；切换标签时传新路径，传 null 取消监视 */
  watchFile: (path: string | null): Promise<boolean> => ipcRenderer.invoke('file:watch', path),
  /** 监听磁盘文件被其他程序修改（仅监听的活跃文件） */
  onExternalFileChange: (
    callback: (change: { path: string; content: string }) => void
  ): (() => void) => subscribe('file:external-change', callback),
  /** 选择另存为路径（不写盘，由调用方确认无重复标签后再保存） */
  chooseSavePath: (defaultFileName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:savePath', defaultFileName),
  /** 在系统文件管理器中定位当前文件 */
  showItemInFolder: (path: string): Promise<boolean> => ipcRenderer.invoke('file:reveal', path),
  /** 用系统默认程序打开外部链接（http/https/mailto） */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  /** 保存图片（Mermaid 图表下载），返回保存路径；用户取消时为 null */
  saveImage: (
    fileName: string,
    data: Uint8Array,
    extension: 'svg' | 'png'
  ): Promise<string | null> => ipcRenderer.invoke('dialog:saveImage', fileName, data, extension),
  exportPdf: (html: string, options: PdfExportOptions): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', html, options),
  /** 关闭主窗口；quit 为 true 表示这是在完成 Cmd+Q / 菜单退出 */
  close: (quit = false): Promise<boolean> => ipcRenderer.invoke('window:close', quit),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  /** 当前整窗缩放比例（1 表示 100%） */
  getZoom: (): Promise<number> => ipcRenderer.invoke('window:get-zoom'),
  /**
   * 同步原生外观主题（nativeTheme.themeSource）。
   * 系统窗口按钮的 hover 对比色按它计算，浅色 UI 在深色系统下需要显式传 light
   */
  setNativeTheme: (theme: 'light' | 'dark' | 'system'): Promise<void> =>
    ipcRenderer.invoke('window:set-native-theme', theme),
  /** 监听整窗缩放比例变化（Ctrl/Cmd + = / - / 0） */
  onZoomChange: (callback: (factor: number) => void): (() => void) =>
    subscribe('window:zoom-changed', callback),
  /** 监听全屏状态变化（全屏时系统窗口按钮不可见，标题栏无需留位） */
  onFullscreenChange: (callback: (fullscreen: boolean) => void): (() => void) =>
    subscribe('window:fullscreen', callback),
  /** macOS Cmd+W：主进程拦截菜单快捷键后转交渲染进程关闭标签页 */
  onCloseTabShortcut: (callback: () => void): (() => void) =>
    subscribeVoid('shortcut:close-tab', callback),
  /** 监听主进程发来的文件打开事件（右键打开 / 命令行传参） */
  onOpenFile: (callback: (result: FileReadResult) => void): (() => void) => {
    const off = subscribe<FileReadResult>('open-file-from-argv', callback)
    // 监听注册完成后再通知主进程放行排队的文件；
    // 不能用 did-finish-load 判断就绪：该事件触发时 isLoading() 仍可能为 true
    if (!rendererReadyNotified) {
      rendererReadyNotified = true
      ipcRenderer.send('renderer:ready')
    }
    return off
  },
  /** 监听窗口关闭请求（主进程 close 事件）；quit 表示本次关闭来自退出应用 */
  onCloseRequest: (callback: (request: { quit: boolean }) => void): (() => void) =>
    subscribe('window:close-request', callback),
  /** 主进程光标位置轮询（滚动条悬停状态判定兜底） */
  onCursorPos: (callback: (pos: { x: number; y: number }) => void): (() => void) =>
    subscribe('cursor-pos', callback),
  /** 会话读写（更新重启后恢复上次打开的标签页） */
  session: {
    load: (): Promise<SessionData | null> => ipcRenderer.invoke('session:load'),
    save: (data: SessionData): Promise<boolean> => ipcRenderer.invoke('session:save', data)
  },
  /** 自动更新：读取状态 / 检测 / 下载 / 安装 / 更新窗口 / 订阅状态变化 */
  update: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
    download: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    /** 打开独立的更新详情窗口 */
    openWindow: (): Promise<void> => ipcRenderer.invoke('update:open-window'),
    /** 更新窗口内关闭自身（窗口随之销毁，用 send 避免 invoke 的回复丢失） */
    closeWindow: (): void => {
      ipcRenderer.send('update:close-window')
    },
    /** 请求主窗口处理未保存内容后安装（由更新详情窗口调用） */
    requestInstall: (): Promise<boolean> => ipcRenderer.invoke('update:request-install'),
    /** 主进程转来的安装请求（主窗口监听） */
    onInstallRequest: (callback: () => void): (() => void) =>
      subscribeVoid('update:install-request', callback),
    onState: (callback: (state: UpdateState) => void): (() => void) =>
      subscribe('update:state', callback)
  }
}

export type ExposedAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // 仅在 contextIsolation 被关闭的极端场景下退化为直接挂载
  ;(globalThis as Record<string, unknown>)['api'] = api
}
