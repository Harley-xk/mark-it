/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: CodeMirror 编辑状态跨窗口序列化、大小限制与安全恢复
 */
import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { historyField } from '@codemirror/commands'

/** 跨窗口载荷上限；超过后只迁移文档状态，避免 IPC 与会话内存被超大历史拖垮 */
export const MAX_EDITOR_STATE_JSON_CHARS = 4 * 1024 * 1024

const EDITOR_STATE_FIELDS = { history: historyField }

export function serializeEditorState(
  state: EditorState,
  maxChars = MAX_EDITOR_STATE_JSON_CHARS
): unknown | undefined {
  try {
    const serialized = state.toJSON(EDITOR_STATE_FIELDS)
    return JSON.stringify(serialized).length <= maxChars ? serialized : undefined
  } catch {
    return undefined
  }
}

export function restoreEditorState(
  serialized: unknown,
  extensions: Extension[]
): EditorState | null {
  if (!serialized || typeof serialized !== 'object') return null
  try {
    return EditorState.fromJSON(serialized, { extensions }, EDITOR_STATE_FIELDS)
  } catch {
    return null
  }
}
