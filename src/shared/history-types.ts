/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 按窗口与标签划分的编辑历史侧车数据纯类型
 */

export type EditorHistoryEntries = Record<string, unknown>

export interface EditorHistoryFile {
  version: 1
  windows: Record<string, EditorHistoryEntries>
}
