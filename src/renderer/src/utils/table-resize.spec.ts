import { describe, expect, it } from 'vitest'
import {
  buildTableKey,
  MAX_TABLE_SCALE,
  MIN_COLUMN_PX,
  MIN_COLUMN_RATIO,
  normalizeWidths,
  resizeAdjacentColumnWidths,
  resizeLastColumn,
  resolveMinColumnRatio,
  sanitizeLayout,
  sanitizeWidths
} from './table-resize'

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

describe('像素最小宽度换算', () => {
  it('应把像素下限换算为当前表格宽度对应的比例', () => {
    expect(resolveMinColumnRatio(800)).toBeCloseTo(MIN_COLUMN_PX / 800)
  })

  it('宽表格的最小占比应低于固定 6%，窄列才压得下去', () => {
    expect(resolveMinColumnRatio(1200)).toBeLessThan(MIN_COLUMN_RATIO)
  })

  it('宽度非法或非正时应回退为固定占比', () => {
    expect(resolveMinColumnRatio(0)).toBe(MIN_COLUMN_RATIO)
    expect(resolveMinColumnRatio(-1)).toBe(MIN_COLUMN_RATIO)
    expect(resolveMinColumnRatio(Number.NaN)).toBe(MIN_COLUMN_RATIO)
  })

  it('按换算后的下限拖动时，序号列应停在约 40px', () => {
    const tableWidth = 1200
    const result = resizeAdjacentColumnWidths([0.5, 0.5], 0, -1, resolveMinColumnRatio(tableWidth))

    expect(result[0] * tableWidth).toBeCloseTo(MIN_COLUMN_PX, 5)
  })
})

describe('内部边界相邻列让位', () => {
  it('被拖列变宽时只收缩右邻列，其余列不动', () => {
    const result = resizeAdjacentColumnWidths([0.5, 0.25, 0.25], 0, 0.1)

    expect(result[0]).toBeCloseTo(0.6)
    expect(result[1]).toBeCloseTo(0.15)
    expect(result[2]).toBeCloseTo(0.25)
    expect(result.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1)
  })

  it('被拖列变窄时只放宽右邻列，其余列不动', () => {
    const result = resizeAdjacentColumnWidths([0.5, 0.25, 0.25], 0, -0.1)

    expect(result[0]).toBeCloseTo(0.4)
    expect(result[1]).toBeCloseTo(0.35)
    expect(result[2]).toBeCloseTo(0.25)
  })

  it('右侧列已触底时被拖列应停在可分配的上限', () => {
    const result = resizeAdjacentColumnWidths([0.75, 0.25], 0, 1)

    expect(result[0]).toBeCloseTo(0.94)
    expect(result[1]).toBeCloseTo(0.06)
  })

  it('两列合计不足两倍像素下限时应各占一半，不应出现负宽度', () => {
    const result = resizeAdjacentColumnWidths([0.2, 0.8], 0, 1, 0.6)

    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0.5)
  })

  it('单列、末列下标、越界下标与非有限增量应安全返回归一化结果', () => {
    expect(resizeAdjacentColumnWidths([1], 0, 0.5)).toEqual([1])
    expect(resizeAdjacentColumnWidths([0.5, 0.5], 1, 0.1)).toEqual([0.5, 0.5])
    expect(resizeAdjacentColumnWidths([1, 1], 5, 0.1)).toEqual([0.5, 0.5])
    expect(resizeAdjacentColumnWidths([1, 1], 0, Number.NaN)).toEqual([0.5, 0.5])
  })

  it('不应修改入参', () => {
    const widths = [0.5, 0.5]
    resizeAdjacentColumnWidths(widths, 0, 0.2)

    expect(widths).toEqual([0.5, 0.5])
  })
})

describe('最右列拖动与表格总宽', () => {
  it('变宽时其余列像素宽度不变，表格总宽按增量放大', () => {
    const result = resizeLastColumn({ widths: [0.5, 0.3, 0.2], scale: 1 }, 0.1, 0.05)

    expect(result.scale).toBeCloseTo(1.1)
    expect(result.widths[2]).toBeCloseTo(0.3 / 1.1)
    expect(result.widths[0] * result.scale).toBeCloseTo(0.5)
    expect(result.widths[1] * result.scale).toBeCloseTo(0.3)
    expect(result.widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1)
  })

  it('变窄时其余列像素宽度不变，表格总宽随之缩小', () => {
    const result = resizeLastColumn({ widths: [0.5, 0.5], scale: 1 }, -0.2, 0.05)

    expect(result.scale).toBeCloseTo(0.8)
    expect(result.widths[0] * result.scale).toBeCloseTo(0.5)
    expect(result.widths[1]).toBeCloseTo(0.3 / 0.8)
  })

  it('末列不应低于最小宽度', () => {
    const result = resizeLastColumn({ widths: [0.5, 0.5], scale: 1 }, -1, 0.2)

    expect(result.widths[1] * result.scale).toBeCloseTo(0.2)
    expect(result.scale).toBeCloseTo(0.7)
  })

  it('总宽不应超过缩放上限', () => {
    const result = resizeLastColumn({ widths: [0.5, 0.5], scale: 1 }, 100, 0.05)

    expect(result.scale).toBeCloseTo(MAX_TABLE_SCALE)
    expect(result.widths[0] * result.scale).toBeCloseTo(0.5)
  })

  it('已有缩放时应在现有总宽上继续增减，其余列像素宽度不变', () => {
    const result = resizeLastColumn({ widths: [0.5, 0.5], scale: 1.5 }, 0.15, 0.05)

    expect(result.scale).toBeCloseTo(1.5 * 1.15)
    expect(result.widths[0] * result.scale).toBeCloseTo(0.75)
    expect(result.widths[1] * result.scale).toBeCloseTo(0.75 + 0.15 * 1.5)
  })

  it('只拖动最后一列时，单列表格应能整体缩放', () => {
    const result = resizeLastColumn({ widths: [1], scale: 1 }, -0.9, 0.1)

    expect(result.scale).toBeCloseTo(0.1)
    expect(result.widths).toEqual([1])
  })

  it('增量非有限数或空列时应原样返回', () => {
    expect(resizeLastColumn({ widths: [0.5, 0.5], scale: 1 }, Number.NaN, 0.05)).toEqual({
      widths: [0.5, 0.5],
      scale: 1
    })
    expect(resizeLastColumn({ widths: [], scale: 1 }, 0.1, 0.05)).toEqual({
      widths: [],
      scale: 1
    })
  })

  it('不应修改入参', () => {
    const layout = { widths: [0.5, 0.5], scale: 1 }
    resizeLastColumn(layout, 0.1, 0.05)

    expect(layout).toEqual({ widths: [0.5, 0.5], scale: 1 })
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

  it('旧版本的纯数组存档应迁移为 scale = 1', () => {
    expect(sanitizeLayout([2, 2])).toEqual({ widths: [0.5, 0.5], scale: 1 })
  })

  it('新结构应保留合法 scale，缺失或非法时回退为 1', () => {
    expect(sanitizeLayout({ widths: [0.5, 0.5], scale: 1.2 })).toEqual({
      widths: [0.5, 0.5],
      scale: 1.2
    })
    expect(sanitizeLayout({ widths: [0.5, 0.5] })).toEqual({ widths: [0.5, 0.5], scale: 1 })
    expect(sanitizeLayout({ widths: [0.5, 0.5], scale: '1.2' })).toEqual({
      widths: [0.5, 0.5],
      scale: 1
    })
  })

  it('scale 越界时应夹在合法区间内', () => {
    expect(sanitizeLayout({ widths: [0.5, 0.5], scale: 0.01 })?.scale).toBeCloseTo(0.1)
    expect(sanitizeLayout({ widths: [0.5, 0.5], scale: 99 })?.scale).toBeCloseTo(MAX_TABLE_SCALE)
  })

  it('结构非法或列宽非法时应丢弃整条存档', () => {
    expect(sanitizeLayout(null)).toBeNull()
    expect(sanitizeLayout('0.5')).toBeNull()
    expect(sanitizeLayout({ widths: [], scale: 1 })).toBeNull()
    expect(sanitizeLayout({ widths: [0.5, -1], scale: 1 })).toBeNull()
  })
})
