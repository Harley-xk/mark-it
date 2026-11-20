import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { RecentFileEntry, RecentOpenResult } from '../shared/recent-types'
import type { UpdateState } from '../shared/update-types'
import type { SessionData } from '../shared/session-types'
import type { Locale } from '../shared/locale-types'
import type { EditorHistoryEntries } from '../shared/history-types'
import type {
  FileOpenFailure,
  FileReadResponse,
  FileReadResult,
  FileSaveResponse,
  OpenFilesResponse
} from '../shared/file-types'
import type { RendererErrorReport } from '../shared/diagnostics-types'
import type { PdfExportOptions } from '../shared/pdf-types'
import type {
  ImageExportOptions,
  ImageExportResult,
  ImageFileExtension
} from '../shared/image-types'
import type { PreviewWindowPayload } from '../shared/preview-types'
import type { ExportProgress } from '../shared/export-types'
import type {
  EditorWindowContext,
  EditorWindowSummary,
  ExitPreparationRequest,
  TabDragTargetState,
  TabDropOptions,
  TabTransferPayload,
  TabTransferResult
} from '../shared/window-types'
import type {
  IntegrationResult,
  VSCodeInstallation,
  VSCodeVariant
} from '../shared/integration-types'

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
  /** 同步主进程当前界面语言，用于原生对话框与更新状态文案 */
  setLocale: (locale: Locale): Promise<boolean> => ipcRenderer.invoke('app:set-locale', locale),
  /** 当前编辑窗口的稳定 ID 与待确认标签迁移 */
  getWindowContext: (): Promise<EditorWindowContext | null> =>
    ipcRenderer.invoke('window:get-context'),
  /** 新建空白编辑窗口 */
  createWindow: (): Promise<boolean> => ipcRenderer.invoke('window:create'),
  /** 把序列化标签迁移到新窗口；目标窗口确认前源标签不会删除 */
  moveTabToNewWindow: (payload: TabTransferPayload): Promise<TabTransferResult | null> =>
    ipcRenderer.invoke('window:move-tab-to-new', payload),
  /** 按当前指针命中的编辑窗口迁移；未命中则新建窗口 */
  moveTabToTargetWindow: (
    payload: TabTransferPayload,
    options?: TabDropOptions
  ): Promise<TabTransferResult | null> =>
    ipcRenderer.invoke('window:move-tab-to-target', payload, options),
  /** 显式迁移到指定编辑窗口 */
  moveTabToWindow: (
    payload: TabTransferPayload,
    windowId: string
  ): Promise<TabTransferResult | null> =>
    ipcRenderer.invoke('window:move-tab-to-window', payload, windowId),
  /** 返回其他可接收标签的编辑窗口 */
  listEditorWindows: (): Promise<EditorWindowSummary[]> => ipcRenderer.invoke('window:list'),
  /** 新窗口读取启动阶段的标签迁移载荷 */
  takePendingTabTransfer: (): Promise<TabTransferPayload | null> =>
    ipcRenderer.invoke('window:take-pending-transfer'),
  /** 目标窗口完成会话恢复后确认标签迁移 */
  ackTabTransfer: (transferId: string): void => {
    ipcRenderer.send('window:ack-tab-transfer', transferId)
  },
  /** 目标窗口拒绝标签迁移（例如同一路径已打开） */
  rejectTabTransfer: (transferId: string): void => {
    ipcRenderer.send('window:reject-tab-transfer', transferId)
  },
  /** 已有编辑窗口接收实时标签迁移 */
  onReceiveTabTransfer: (callback: (payload: TabTransferPayload) => void): (() => void) =>
    subscribe('window:receive-tab-transfer', callback),
  /** 开始跨窗口拖拽悬浮提示、目标命中与高亮 */
  startTabDrag: (tabName: string, theme: 'light' | 'dark'): void => {
    ipcRenderer.send('window:tab-drag-start', tabName, theme)
  },
  /** 拖拽中每帧通知主进程同步悬浮提示位置（空载荷，主进程直接读取系统光标） */
  notifyTabDragMove: (): void => {
    ipcRenderer.send('window:tab-drag-move')
  },
  /** 结束拖拽并清除目标高亮 */
  endTabDrag: (): void => {
    ipcRenderer.send('window:tab-drag-end')
  },
  onTabDragTarget: (callback: (state: TabDragTargetState) => void): (() => void) =>
    subscribe('window:tab-drag-target', callback),
  /** 同步当前编辑窗口打开的磁盘文件，供跨窗口常规打开去重 */
  syncOpenFiles: (paths: string[]): Promise<boolean> =>
    ipcRenderer.invoke('file:sync-open-paths', paths),
  /** 主进程要求所有编辑窗口在退出 / 安装前保存 */
  onPrepareExit: (callback: (request: ExitPreparationRequest) => void): (() => void) =>
    subscribe('app:prepare-exit', callback),
  completePrepareExit: (requestId: string, ok: boolean): void => {
    ipcRenderer.send('app:prepare-exit-result', { requestId, ok })
  },
  /** 打开或聚焦独立设置窗口；只应由编辑器窗口调用 */
  settings: {
    open: (): Promise<boolean> => ipcRenderer.invoke('settings:open')
  },
  /** 独立预览窗口：打开 / 替换内容、取载荷与关闭 */
  preview: {
    open: (payload: PreviewWindowPayload): Promise<boolean> =>
      ipcRenderer.invoke('preview:open', payload),
    takePayload: (): Promise<PreviewWindowPayload | null> =>
      ipcRenderer.invoke('preview:take-payload'),
    close: (): Promise<boolean> => ipcRenderer.invoke('preview:close'),
    /** 预览窗口已存在时接收替换后的载荷 */
    onPayload: (callback: (payload: PreviewWindowPayload) => void): (() => void) =>
      subscribe('preview:payload', callback)
  },
  /** 打开文件对话框，支持多选；返回成功文件与失败项 */
  openFiles: (): Promise<OpenFilesResponse> => ipcRenderer.invoke('dialog:openFiles'),
  /**
   * 拖拽打开：File 对象由 preload 用 webUtils 解析成真实磁盘路径。
   * 渲染进程无法伪造 File 的路径，因此不能借此读取任意文件。
   */
  openDroppedFiles: (files: File[]): Promise<OpenFilesResponse> => {
    const paths = files
      .map((file) => webUtils.getPathForFile(file))
      .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0)
    return ipcRenderer.invoke('file:open-dropped', paths)
  },
  saveFile: (path: string, content: string): Promise<FileSaveResponse> =>
    ipcRenderer.invoke('file:save', path, content),
  readFile: (path: string): Promise<FileReadResponse> => ipcRenderer.invoke('file:read', path),
  /** 打开文档内链接指向的本地 Markdown 文件（仅接受绝对路径与 md / markdown 扩展名） */
  openLinkedMarkdown: (path: string): Promise<OpenFilesResponse> =>
    ipcRenderer.invoke('file:open-linked', path),
  /** 只监视当前活跃标签对应的磁盘文件；切换标签时传新路径，传 null 取消监视 */
  watchFile: (path: string | null): Promise<boolean> => ipcRenderer.invoke('file:watch', path),
  /** 监听磁盘文件被其他程序修改（仅监听的活跃文件） */
  onExternalFileChange: (
    callback: (change: { path: string; content: string }) => void
  ): (() => void) => subscribe('file:external-change', callback),
  /** 监听活跃文件被外部删除 */
  onFileMissing: (callback: (change: { path: string }) => void): (() => void) =>
    subscribe('file:missing', callback),
  /** 选择另存为路径（不写盘，由调用方确认无重复标签后再保存） */
  chooseSavePath: (defaultFileName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:savePath', defaultFileName),
  /** 在系统文件管理器中定位当前文件 */
  showItemInFolder: (path: string): Promise<boolean> => ipcRenderer.invoke('file:reveal', path),
  /** 用系统默认程序打开外部链接（http/https/mailto） */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  /** 保存图片（Mermaid 图表与 data/blob 图片），返回保存路径；用户取消时为 null */
  saveImage: (
    fileName: string,
    data: Uint8Array,
    extension: ImageFileExtension
  ): Promise<string | null> => ipcRenderer.invoke('dialog:saveImage', fileName, data, extension),
  /** 本地预览图片另存为：直接复制源文件，返回保存路径；取消或源文件缺失时为 null */
  saveImageFromPath: (sourcePath: string, fileName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveImageFromPath', sourcePath, fileName),
  /** 下载远程预览图片，返回保存路径；取消或非 http(s) 地址时为 null */
  downloadImage: (url: string, fileName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:downloadImage', url, fileName),
  exportPdf: (html: string, options: PdfExportOptions, requestId: string): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', html, options, requestId),
  exportImage: (
    html: string,
    options: ImageExportOptions,
    requestId: string
  ): Promise<ImageExportResult | null> =>
    ipcRenderer.invoke('export:image', html, options, requestId),
  /** 订阅当前编辑窗口的导出阶段进度；调用方按 requestId 过滤自己的任务 */
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) =>
    subscribe('export:progress', callback),
  /** 关闭当前编辑窗口；兼容保留 quit 参数 */
  close: (quit = false): Promise<boolean> => ipcRenderer.invoke('window:close', quit),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  /** 当前整窗缩放比例（1 表示 100%） */
  getZoom: (): Promise<number> => ipcRenderer.invoke('window:get-zoom'),
  /** 设置整窗缩放比例（1 表示 100%）；主进程会归一并广播变化 */
  setZoom: (factor: number): Promise<boolean> => ipcRenderer.invoke('window:set-zoom', factor),
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
  /** 监听启动 / 右键 / 命令行打开失败的文件，汇总提示用户 */
  onOpenFileError: (callback: (failures: FileOpenFailure[]) => void): (() => void) =>
    subscribe('file:open-error', callback),
  /** 最近打开文件：全局列表由主进程维护，渲染进程只读取与清除 */
  recent: {
    list: (): Promise<RecentFileEntry[]> => ipcRenderer.invoke('recent:list'),
    open: (path: string): Promise<RecentOpenResult> => ipcRenderer.invoke('recent:open', path),
    clear: (): Promise<boolean> => ipcRenderer.invoke('recent:clear'),
    /** 列表变化（任一窗口打开文件 / 清除）后广播 */
    onChanged: (callback: () => void): (() => void) => subscribeVoid('recent:changed', callback)
  },
  /** 导出诊断日志；用户取消返回 null */
  exportDiagnostics: (): Promise<string | null> => ipcRenderer.invoke('diagnostics:export'),
  /** 上报渲染进程未捕获错误，写入主进程滚动日志 */
  reportRendererError: (payload: RendererErrorReport): void => {
    ipcRenderer.send('diagnostics:renderer-error', payload)
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
  /** 撤销 / 重做历史側车：只持久化当前编辑窗口，不写入 session.json */
  history: {
    load: (): Promise<EditorHistoryEntries> => ipcRenderer.invoke('history:load'),
    save: (entries: EditorHistoryEntries): Promise<boolean> =>
      ipcRenderer.invoke('history:save', entries)
  },
  /** VSCode 编辑器集成：检测、安装与卸载；路径始终由主进程推断 */
  integration: {
    detectVSCode: (): Promise<VSCodeInstallation[]> =>
      ipcRenderer.invoke('integration:detect-vscode'),
    installVSCode: (variant: VSCodeVariant): Promise<IntegrationResult> =>
      ipcRenderer.invoke('integration:install-vscode', variant),
    uninstallVSCode: (variant: VSCodeVariant): Promise<IntegrationResult> =>
      ipcRenderer.invoke('integration:uninstall-vscode', variant)
  },
  /** 自动更新：读取状态 / 检测 / 下载 / 安装 / 更新窗口 / 订阅状态变化 */
  update: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
    download: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
    /** 切换「接收 Beta 版更新」，返回持久化后的最新状态 */
    setBetaEnabled: (enabled: boolean): Promise<UpdateState> =>
      ipcRenderer.invoke('update:set-beta-enabled', enabled),
    /** 当前 Beta 用户主动回退到 stable 通道当前最新版本 */
    rollbackToStable: (): Promise<UpdateState> => ipcRenderer.invoke('update:rollback-to-stable'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    /** 打开独立的更新详情窗口 */
    openWindow: (): Promise<void> => ipcRenderer.invoke('update:open-window'),
    /** 更新窗口内关闭自身（窗口随之销毁，用 send 避免 invoke 的回复丢失） */
    closeWindow: (): void => {
      ipcRenderer.send('update:close-window')
    },
    /** 请求主进程协调全部编辑窗口保存后安装 */
    requestInstall: (): Promise<boolean> => ipcRenderer.invoke('update:request-install'),
    onState: (callback: (state: UpdateState) => void): (() => void) =>
      subscribe('update:state', callback),
    /** 编辑窗口右下角提示是否允许显示（主进程按检测来源与更新窗口状态下发） */
    onNoticeAllowed: (callback: (allowed: boolean) => void): (() => void) =>
      subscribe('update:notice-allowed', callback)
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
