import { describe, expect, it } from 'vitest'
import { buildTableKey, normalizeWidths, resizeColumnWidths, sanitizeWidths } from './table-resize'

describe('列宽比例归一化', () => {
  it('应把任意正数数组归一化为和为 1 的比例', () => {
    expect(normalizeWidths([1, 1, 2])).toEqual([0.25, 0.25, 0.5])
  })

  it('全部为 0 时应平均分配', () => {
    expect(normalizeWidths([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('非有限数与非正数应按 0 处理', () => {
    expect(normalizeWidths([-1, Number.NaN, 2])).toEqual([0, 0, 1])
  })

  it('空数组应返回空数组', () => {
    expect(normalizeWidths([])).toEqual([])
  })
})

describe('拖动列宽重分配', () => {
  it('被拖列变宽时其余列应按比例收缩，总和保持 1', () => {
    const result = resizeColumnWidths([0.5, 0.25, 0.25], 0, 0.1)

    expect(result[0]).toBeCloseTo(0.6)
    expect(result[1]).toBeCloseTo(0.2)
    expect(result[2]).toBeCloseTo(0.2)
    expect(result.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1)
  })

  it('被拖列变窄时其余列应按比例变宽', () => {
    const result = resizeColumnWidths([0.5, 0.25, 0.25], 0, -0.1)

    expect(result[0]).toBeCloseTo(0.4)
    expect(result[1]).toBeCloseTo(0.3)
    expect(result[2]).toBeCloseTo(0.3)
  })

  it('不应把任何列压到最小占比以下', () => {
    const result = resizeColumnWidths([0.5, 0.5], 0, -1)

    expect(result[0]).toBeCloseTo(0.06)
    expect(result[1]).toBeCloseTo(0.94)
  })

  it('其余列已触底时被拖列应停在可分配的上限', () => {
    const result = resizeColumnWidths([0.94, 0.06], 0, 1)

    expect(result[0]).toBeCloseTo(0.94)
    expect(result[1]).toBeCloseTo(0.06)
  })

  it('列数很多时应按 1/n 收敛最小占比，不应出现 0 或负数', () => {
    const widths = Array.from({ length: 20 }, () => 1 / 20)
    const result = resizeColumnWidths(widths, 0, -1)

    expect(result.every((width) => width >= 1 / 20 - 1e-9)).toBe(true)
    expect(result.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1)
  })

  it('单列、越界下标与非有限增量应安全返回归一化结果', () => {
    expect(resizeColumnWidths([1], 0, 0.5)).toEqual([1])
    expect(resizeColumnWidths([1, 1], 5, 0.1)).toEqual([0.5, 0.5])
    expect(resizeColumnWidths([1, 1], 0, Number.NaN)).toEqual([0.5, 0.5])
  })

  it('不应修改入参', () => {
    const widths = [0.5, 0.5]
    resizeColumnWidths(widths, 0, 0.2)

    expect(widths).toEqual([0.5, 0.5])
  })
})

describe('表格标识', () => {
  it('表头文本忽略大小写与多余空白', () => {
    expect(buildTableKey(['  Name ', 'AGE'], 0)).toBe(buildTableKey(['name', 'age'], 0))
  })

  it('表头不同或顺序不同应生成不同标识', () => {
    expect(buildTableKey(['a', 'b'], 0)).not.toBe(buildTableKey(['a', 'c'], 0))
    expect(buildTableKey(['a', 'b'], 0)).not.toBe(buildTableKey(['b', 'a'], 0))
  })

  it('表头相同的多张表应通过序号区分', () => {
    expect(buildTableKey(['a'], 0)).not.toBe(buildTableKey(['a'], 1))
    expect(buildTableKey(['a'], 1)).toMatch(/-1$/)
  })
})

describe('存档校验', () => {
  it('非数组、空数组与非法数值应被丢弃', () => {
    expect(sanitizeWidths(null)).toBeNull()
    expect(sanitizeWidths('0.5')).toBeNull()
    expect(sanitizeWidths([])).toBeNull()
    expect(sanitizeWidths([0.5, 0])).toBeNull()
    expect(sanitizeWidths([0.5, Number.NaN])).toBeNull()
    expect(sanitizeWidths(['0.5', 0.5])).toBeNull()
  })

  it('合法数据应归一化后返回', () => {
    expect(sanitizeWidths([2, 2])).toEqual([0.5, 0.5])
  })
})
