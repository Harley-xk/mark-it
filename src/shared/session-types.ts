/** 主进程与渲染进程共用的会话（上次打开的标签页）类型（纯类型，无运行时依赖） */

/** 编辑器布局：左编辑右预览 / 左预览右编辑 / 仅编辑 / 仅预览 */
export type LayoutMode = 'edit-left' | 'edit-right' | 'edit-only' | 'preview-only'

export interface SessionTab {
  /** 编辑历史的稳定标识；旧会话缺失时由渲染进程补发 */
  historyId?: string
  /** 文件路径；从未保存过的新建文档为 null */
  path: string | null
  name: string
  /** 文档内容，统一使用 LF 换行 */
  content: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  /** 原文件换行符；缺失时按 LF 处理（兼容旧会话） */
  eol?: '\n' | '\r\n'
  /** 原文件是否带 UTF-8 BOM；缺失时按 false 处理（兼容旧会话） */
  bom?: boolean
  /** 标签自己的布局模式；缺失时按 markit-layout 回退（兼容旧会话） */
  layoutMode?: LayoutMode
  /** 编辑区顶部可见行在文档中的偏移；缺失或 0 时从顶部开始（兼容旧会话） */
  scrollAnchor?: number
  /** 编辑区像素滚动位置，anchor 不可用时的兜底；缺失或 0 时从顶部开始（兼容旧会话） */
  scrollTop?: number
  /** 预览区像素滚动位置（内容锚点不可用时的兜底）；缺失或 0 时从顶部开始（兼容旧会话） */
  previewScrollTop?: number
  /** 预览区顶部可见的 .preview-content 直接子元素下标；缺失时按像素兜底（兼容旧会话） */
  previewScrollAnchor?: number
  /** 预览区视口顶部相对锚点元素顶部的偏移（像素，向下为正）；缺失时按 0 处理（兼容旧会话） */
  previewScrollOffset?: number
}

export interface SessionData {
  tabs: SessionTab[]
  /** 激活标签在 tabs 中的下标 */
  activeIndex: number
}

/** 一个编辑窗口的会话切片 */
export interface SessionWindow extends SessionData {
  id: string
}

/** 会话文件 v2：按编辑窗口保存标签快照 */
export interface SessionFile {
  version: 2
  windows: SessionWindow[]
  lastFocusedWindowId?: string
}
