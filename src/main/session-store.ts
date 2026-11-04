/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 会话文件的运行时结构校验，避免损坏的 session.json 导致恢复异常
 */
import type { SessionData, SessionTab } from '../shared/session-types'

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.floor(value)
  return rounded > 0 ? rounded : fallback
}

function normalizeTab(value: unknown): SessionTab | null {
  if (!value || typeof value !== 'object') return null
  const tab = value as Record<string, unknown>
  if (typeof tab.content !== 'string') return null

  return {
    path: typeof tab.path === 'string' && tab.path.length > 0 ? tab.path : null,
    name: typeof tab.name === 'string' && tab.name.length > 0 ? tab.name : 'untitled.md',
    content: tab.content,
    isModified: tab.isModified === true,
    cursorLine: positiveInt(tab.cursorLine, 1),
    cursorCol: positiveInt(tab.cursorCol, 1),
    eol: tab.eol === '\r\n' ? '\r\n' : '\n',
    bom: tab.bom === true
  }
}

/**
 * 校验并归一化会话数据。
 * 任何字段缺失或类型不符时使用安全默认值；整体结构不可用时返回 null。
 */
export function parseSessionData(value: unknown): SessionData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.tabs)) return null

  const tabs = data.tabs
    .map((tab) => normalizeTab(tab))
    .filter((tab): tab is SessionTab => tab !== null)
  if (tabs.length === 0) return null

  const activeIndex =
    typeof data.activeIndex === 'number' && Number.isFinite(data.activeIndex)
      ? Math.min(Math.max(Math.floor(data.activeIndex), 0), tabs.length - 1)
      : 0

  return { tabs, activeIndex }
}
