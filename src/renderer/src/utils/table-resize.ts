/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 预览表格列宽的纯计算：比例归一化、拖动重分配、表标识生成与存档校验
 */

/** 单列最小宽度（像素）：按表格实际像素宽度换算为比例，宽预览下窄列（如序号）才压得下去 */
export const MIN_COLUMN_PX = 40

/** 无法取得表格像素宽度时退化的最小占比；列数过多时按 1/n 继续收敛 */
export const MIN_COLUMN_RATIO = 0.06

const EPSILON = 1e-9

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
 * 拖动第 index 列 delta（相对总宽度的增量）后重新分配各列比例。
 *
 * - 被拖列夹在 [minRatio, 1 - minRatio × (n - 1)] 之间；
 * - 其余列按当前比例分摊差额，触底的列锁定后继续分摊剩余部分；
 * - 返回新数组，不修改入参。
 */
export function resizeColumnWidths(
  widths: number[],
  index: number,
  delta: number,
  minRatio = MIN_COLUMN_RATIO
): number[] {
  const base = normalizeWidths(widths)
  if (base.length <= 1 || index < 0 || index >= base.length || !Number.isFinite(delta)) {
    return base
  }

  // 列数很多时最小宽度可能让所有列都放不下，收敛到平均宽度
  const safeMin = Math.min(Math.max(minRatio, 0), 1 / base.length)
  const result = base.slice()
  const current = result[index]
  const maxCurrent = Math.max(safeMin, 1 - safeMin * (base.length - 1))
  const target = Math.min(maxCurrent, Math.max(safeMin, current + delta))
  const actual = target - current
  result[index] = target

  if (Math.abs(actual) < EPSILON) return result

  const otherIndices: number[] = []
  for (let i = 0; i < base.length; i++) {
    if (i !== index) otherIndices.push(i)
  }

  if (actual > 0) {
    // 被拖列变宽：其余列按比例收缩，触底后继续由仍有余量的列分摊
    let remaining = actual
    while (remaining > EPSILON) {
      const flexible = otherIndices.filter((i) => result[i] - safeMin > EPSILON)
      if (flexible.length === 0) break
      const totalFlexible = flexible.reduce((sum, i) => sum + result[i], 0)
      let removed = 0
      for (const i of flexible) {
        const share =
          totalFlexible > 0 ? remaining * (result[i] / totalFlexible) : remaining / flexible.length
        const next = Math.max(safeMin, result[i] - share)
        removed += result[i] - next
        result[i] = next
      }
      if (removed <= EPSILON) break
      remaining -= removed
    }
    // 理论上上限已保证差额可分摊完，浮点误差或极端取值时回退被拖列
    if (remaining > EPSILON) result[index] = Math.max(safeMin, result[index] - remaining)
  } else {
    // 被拖列变窄：其余列按比例变宽
    const grow = -actual
    const totalOthers = otherIndices.reduce((sum, i) => sum + result[i], 0)
    for (const i of otherIndices) {
      result[i] += totalOthers > 0 ? grow * (result[i] / totalOthers) : grow / otherIndices.length
    }
  }

  return result
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
