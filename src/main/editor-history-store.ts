/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 编辑历史侧车文件的运行时校验、大小限制与窗口切片解析
 */
import type { EditorHistoryEntries, EditorHistoryFile } from '../shared/history-types'

export const MAX_HISTORY_ENTRY_CHARS = 4 * 1024 * 1024
export const MAX_HISTORY_WINDOW_CHARS = 32 * 1024 * 1024

function serializedLength(value: unknown): number | null {
  try {
    return JSON.stringify(value).length
  } catch {
    return null
  }
}

export function capHistoryEntries(
  value: unknown,
  maxEntryChars = MAX_HISTORY_ENTRY_CHARS,
  maxWindowChars = MAX_HISTORY_WINDOW_CHARS
): EditorHistoryEntries {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries: EditorHistoryEntries = {}
  let total = 0
  for (const [historyId, state] of Object.entries(value)) {
    if (!historyId || !state || typeof state !== 'object') continue
    const length = serializedLength(state)
    if (length === null || length > maxEntryChars || total + length > maxWindowChars) continue
    entries[historyId] = state
    total += length
  }
  return entries
}

export function parseEditorHistoryFile(value: unknown): EditorHistoryFile | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.version !== 1 || !data.windows || typeof data.windows !== 'object') return null

  const windows: Record<string, EditorHistoryEntries> = {}
  for (const [windowId, entries] of Object.entries(data.windows as Record<string, unknown>)) {
    if (!windowId) continue
    windows[windowId] = capHistoryEntries(entries)
  }
  return { version: 1, windows }
}
