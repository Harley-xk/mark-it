/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 会话文件的运行时结构校验，避免损坏的 session.json 导致恢复异常
 */
import type {
  LayoutMode,
  SessionData,
  SessionFile,
  SessionTab,
  SessionWindow
} from '../shared/session-types'

/** 与渲染进程 utils/layout-mode 保持一致；主进程不能引用渲染进程模块 */
const LAYOUT_MODES: LayoutMode[] = ['edit-left', 'edit-right', 'edit-only', 'preview-only']

function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === 'string' && (LAYOUT_MODES as string[]).includes(value)
}

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.floor(value)
  return rounded > 0 ? rounded : fallback
}

/** 滚动位置允许 0（从顶部开始）；负数、非数字、非有限值一律视为缺失 */
function scrollAmount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

/** 渲染块下标：非负整数，其余视为缺失 */
function anchorIndex(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded >= 0 ? rounded : undefined
}

/** 相对锚点的偏移允许负数：只要有限即可 */
function signedAmount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizeSessionTab(value: unknown): SessionTab | null {
  if (!value || typeof value !== 'object') return null
  const tab = value as Record<string, unknown>
  if (typeof tab.content !== 'string') return null

  return {
    historyId:
      typeof tab.historyId === 'string' && tab.historyId.length > 0 ? tab.historyId : undefined,
    path: typeof tab.path === 'string' && tab.path.length > 0 ? tab.path : null,
    name: typeof tab.name === 'string' && tab.name.length > 0 ? tab.name : 'untitled.md',
    content: tab.content,
    isModified: tab.isModified === true,
    cursorLine: positiveInt(tab.cursorLine, 1),
    cursorCol: positiveInt(tab.cursorCol, 1),
    eol: tab.eol === '\r\n' ? '\r\n' : '\n',
    bom: tab.bom === true,
    // 非法 / 缺失时保持 undefined，由渲染进程按 markit-layout 兜底
    layoutMode: isLayoutMode(tab.layoutMode) ? tab.layoutMode : undefined,
    // 非法 / 缺失时保持 undefined，由渲染进程按 markit-show-outline 兜底
    outlineVisible: typeof tab.outlineVisible === 'boolean' ? tab.outlineVisible : undefined,
    scrollAnchor: scrollAmount(tab.scrollAnchor),
    scrollTop: scrollAmount(tab.scrollTop),
    previewScrollTop: scrollAmount(tab.previewScrollTop),
    previewScrollAnchor: anchorIndex(tab.previewScrollAnchor),
    previewScrollOffset: signedAmount(tab.previewScrollOffset)
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
    .map((tab) => normalizeSessionTab(tab))
    .filter((tab): tab is SessionTab => tab !== null)
  if (tabs.length === 0) return null

  const activeIndex =
    typeof data.activeIndex === 'number' && Number.isFinite(data.activeIndex)
      ? Math.min(Math.max(Math.floor(data.activeIndex), 0), tabs.length - 1)
      : 0

  return { tabs, activeIndex }
}

function normalizeSessionWindow(value: unknown): SessionWindow | null {
  if (!value || typeof value !== 'object') return null
  const window = value as Record<string, unknown>
  if (typeof window.id !== 'string' || window.id.length === 0) return null
  const data = parseSessionData(window)
  return data ? { id: window.id, ...data } : null
}

/**
 * 解析会话文件 v2。
 * 旧版单窗口结构会迁移为 `legacy` 切片，由主进程在实际创建窗口时替换为稳定 ID。
 */
export function parseSessionFile(value: unknown): SessionFile | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>

  if (data.version === 2 && Array.isArray(data.windows)) {
    const windows = data.windows
      .map((window) => normalizeSessionWindow(window))
      .filter((window): window is SessionWindow => window !== null)
    if (windows.length === 0) return null
    const lastFocusedWindowId =
      typeof data.lastFocusedWindowId === 'string' &&
      windows.some((window) => window.id === data.lastFocusedWindowId)
        ? data.lastFocusedWindowId
        : undefined
    return { version: 2, windows, lastFocusedWindowId }
  }

  const legacy = parseSessionData(data)
  if (!legacy) return null
  return {
    version: 2,
    windows: [{ id: 'legacy', ...legacy }],
    lastFocusedWindowId: 'legacy'
  }
}
