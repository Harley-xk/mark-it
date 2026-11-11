/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 多窗口几何状态的结构校验与旧版单窗口迁移
 */

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
  zoomFactor: number
}

export interface WindowStateFile {
  version: 2
  windows: Record<string, WindowState>
  lastFocusedWindowId?: string
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

const MIN_ZOOM_FACTOR = 0.5
const MAX_ZOOM_FACTOR = 3

export function normalizeZoomFactor(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, Math.round(value * 10) / 10))
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeWindowState(value: unknown): WindowState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Record<string, unknown>
  if (!finiteNumber(state.width) || !finiteNumber(state.height)) return null

  const result: WindowState = {
    width: Math.max(800, state.width),
    height: Math.max(600, state.height),
    zoomFactor: normalizeZoomFactor(finiteNumber(state.zoomFactor) ? state.zoomFactor : 1),
    isMaximized: state.isMaximized === true
  }
  if (finiteNumber(state.x)) result.x = state.x
  if (finiteNumber(state.y)) result.y = state.y
  return result
}

/** 将新窗口按光标锚点居中放在指定显示器可用区域内 */
export function placeWindowOnWorkArea(
  workArea: WorkArea,
  preferredWidth: number,
  preferredHeight: number,
  anchor: { x: number; y: number }
): { width: number; height: number; x: number; y: number } {
  const width = Math.min(preferredWidth, workArea.width)
  const height = Math.min(preferredHeight, workArea.height)
  return {
    width,
    height,
    x: Math.min(
      Math.max(Math.round(anchor.x - width / 2), workArea.x),
      workArea.x + workArea.width - width
    ),
    y: Math.min(
      Math.max(Math.round(anchor.y - height / 2), workArea.y),
      workArea.y + workArea.height - height
    )
  }
}

/** 将窗口居中放在指定显示器可用区域内，并夹取到工作区尺寸 */
export function centerWindowOnWorkArea(
  workArea: WorkArea,
  preferredWidth: number,
  preferredHeight: number
): { width: number; height: number; x: number; y: number } {
  return placeWindowOnWorkArea(workArea, preferredWidth, preferredHeight, {
    x: workArea.x + workArea.width / 2,
    y: workArea.y + workArea.height / 2
  })
}

/**
 * 解析窗口状态文件。
 * 旧版单窗口对象会迁移给调用方指定的首个窗口；损坏切片被丢弃。
 */
export function parseWindowStateFile(
  value: unknown,
  legacyWindowId?: string
): WindowStateFile | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>

  if (data.version === 2 && data.windows && typeof data.windows === 'object') {
    const windows: Record<string, WindowState> = {}
    for (const [id, state] of Object.entries(data.windows as Record<string, unknown>)) {
      const normalized = normalizeWindowState(state)
      if (id && normalized) windows[id] = normalized
    }
    const lastFocused =
      typeof data.lastFocusedWindowId === 'string' && windows[data.lastFocusedWindowId]
        ? data.lastFocusedWindowId
        : undefined
    return { version: 2, windows, lastFocusedWindowId: lastFocused }
  }

  const legacy = normalizeWindowState(data)
  if (!legacy || !legacyWindowId) return null
  return {
    version: 2,
    windows: { [legacyWindowId]: legacy },
    lastFocusedWindowId: legacyWindowId
  }
}
