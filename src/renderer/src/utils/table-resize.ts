/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 预览表格列宽的纯计算：比例归一化、相邻列重分配、末列缩放、表标识与存档校验
 */

/** 单列最小宽度（像素）：按表格实际像素宽度换算为比例，宽预览下窄列（如序号）才压得下去 */
export const MIN_COLUMN_PX = 40

/** 无法取得表格像素宽度时退化的最小占比；列数过多时按 1/n 继续收敛 */
export const MIN_COLUMN_RATIO = 0.06

/** 表格总宽相对预览内容宽度的缩放下限与上限；上限避免拖动异常把表格拉得过大 */
export const MIN_TABLE_SCALE = 0.1
export const MAX_TABLE_SCALE = 3

/**
 * 一张表的列宽存档。
 * - `widths`：各列占表格自身宽度的比例，和为 1；
 * - `scale`：表格总宽 / 预览内容宽度，未调整过最右列时为 1。
 */
export interface TableLayout {
  widths: number[]
  scale: number
}

/**
 * 把像素下限换算为当前表格宽度下的最小占比。
 * 表格宽度非法或非正时回退为 MIN_COLUMN_RATIO。
 */
export function resolveMinColumnRatio(tableWidth: number): number {
  if (!Number.isFinite(tableWidth) || tableWidth <= 0) return MIN_COLUMN_RATIO
  return MIN_COLUMN_PX / tableWidth
}

/**
 * 把任意数值数组归一化为和为 1 的比例。
 * 非有限数与非正数视为 0；全部为 0 时平均分配，空数组返回空数组。
 */
export function normalizeWidths(widths: number[]): number[] {
  const values = widths.map((width) => (Number.isFinite(width) && width > 0 ? width : 0))
  if (values.length === 0) return []
  const total = values.reduce((sum, width) => sum + width, 0)
  if (total <= 0) return values.map(() => 1 / values.length)
  return values.map((width) => width / total)
}

/**
 * 拖动内部边界（第 index 列与第 index + 1 列之间）delta 后重新分配这两列。
 *
 * - 只改变相邻两列，两列之和不变，其余列保持原比例；
 * - 两列各自不低于最小占比；合计不足两倍下限时收敛为各占一半；
 * - 返回新数组，不修改入参。
 */
export function resizeAdjacentColumnWidths(
  widths: number[],
  index: number,
  delta: number,
  minRatio = MIN_COLUMN_RATIO
): number[] {
  const base = normalizeWidths(widths)
  if (base.length < 2 || index < 0 || index >= base.length - 1 || !Number.isFinite(delta)) {
    return base
  }

  const pair = base[index] + base[index + 1]
  const safeMin = Math.min(Math.max(minRatio, 0), pair / 2)
  const target = Math.min(pair - safeMin, Math.max(safeMin, base[index] + delta))
  const result = base.slice()
  result[index] = target
  result[index + 1] = pair - target
  return result
}

/**
 * 拖动最右列边界 delta（相对当前表格总宽度的增量）后的新布局。
 *
 * 其余列的像素宽度保持不变，只有最后一列增减，表格总宽度随之变化：
 * `scale` 按新的总宽重新换算，其余列比例按「新总宽 / 旧总宽」同步重算。
 */
export function resizeLastColumn(
  layout: TableLayout,
  delta: number,
  minRatio: number,
  maxScale = MAX_TABLE_SCALE
): TableLayout {
  const widths = normalizeWidths(layout.widths)
  const scale = normalizeScale(layout.scale)
  if (widths.length === 0 || !Number.isFinite(delta)) return { widths, scale }

  const last = widths.length - 1
  const current = widths[last]
  // 增量以旧表宽为基准，新总宽换算成「旧表宽的倍数」；scale 上限换算到同一基准
  const safeMin = Math.min(Math.max(minRatio, 0), 1)
  const maxTotal = maxScale / scale
  const maxLast = Math.max(current, maxTotal - (1 - current))
  const target = Math.min(maxLast, Math.max(safeMin, current + delta))
  const total = 1 - current + target
  if (!Number.isFinite(total) || total <= 0) return { widths, scale }

  return {
    widths: widths.map((width, index) => (index === last ? target / total : width / total)),
    scale: scale * total
  }
}

/** 缩放值归一化：非有限数或非正数回退为 1，并夹在合法区间内 */
function normalizeScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(MAX_TABLE_SCALE, Math.max(MIN_TABLE_SCALE, scale))
}

/** 表头文本规范化：折叠空白、去首尾空格、转小写，避免空格与大小写差异打散标识 */
function normalizeHeaders(headers: string[]): string {
  return headers.map((header) => header.replace(/\s+/g, ' ').trim().toLowerCase()).join('\u0001')
}

/** djb2 变体的 32 位散列，输出 base36 短串 */
export function hashTableHeaders(headers: string[]): string {
  const input = normalizeHeaders(headers)
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/**
 * 表格在文档中的稳定标识：表头哈希 + 同名表序号。
 * 正文增删不影响，修改表头文字会视为另一张表。
 */
export function buildTableKey(headers: string[], duplicateIndex: number): string {
  const suffix = duplicateIndex > 0 ? `-${duplicateIndex}` : ''
  return `${hashTableHeaders(headers)}${suffix}`
}

/** 校验从 localStorage 读出的列宽；非法数据返回 null，合法数据归一化后返回 */
export function sanitizeWidths(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const values: number[] = []
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item) || item <= 0) return null
    values.push(item)
  }
  return normalizeWidths(values)
}

/**
 * 校验从 localStorage 读出的表格布局。
 * 兼容旧版本的纯列宽数组（按 scale = 1 迁移）；非法数据返回 null。
 */
export function sanitizeLayout(value: unknown): TableLayout | null {
  // 旧版本只保存比例数组
  if (Array.isArray(value)) {
    const widths = sanitizeWidths(value)
    return widths ? { widths, scale: 1 } : null
  }
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const widths = sanitizeWidths(record.widths)
  if (!widths) return null
  const scale = typeof record.scale === 'number' ? record.scale : 1
  return { widths, scale: normalizeScale(scale) }
}
