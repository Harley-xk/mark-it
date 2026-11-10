/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 编辑器窗口上下文、标签迁移与退出协调的跨进程纯类型
 */
import type { SessionTab } from './session-types'

export interface EditorWindowContext {
  id: string
  pendingTransferId: string | null
}

export interface TabTransferPayload {
  transferId: string
  tab: SessionTab
  /** CodeMirror EditorState JSON；超过大小上限或无可用缓存时省略 */
  editorStateJson?: unknown
}

export interface TabTransferResult {
  transferId: string
  windowId: string
  mode: 'new' | 'existing'
}

export interface TabDropOptions {
  /** 指针仍在源窗口内容区时强制新建窗口，避免命中源窗口背后的其他窗口 */
  forceNew?: boolean
}

export interface EditorWindowSummary {
  id: string
  title: string
}

export interface TabDragTargetState {
  active: boolean
  tabName: string
  sourceWindowId: string
}

export type ExitPreparationKind = 'quit' | 'install'

export interface ExitPreparationRequest {
  requestId: string
  kind: ExitPreparationKind
  actionLabel: string
}

export interface ExitPreparationResult {
  requestId: string
  ok: boolean
}
