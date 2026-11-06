import { describe, expect, it } from 'vitest'
import { findInsertBefore, moveItem } from './tab-order'

describe('moveItem', () => {
  it('应把标签向后移动并保持其他标签顺序', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 1, 3)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('应支持把标签向前移动', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 2, 0)).toEqual(['C', 'A', 'B', 'D'])
  })

  it('应支持把标签移动到末尾', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 0, 4)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('目标间隙与源位置相同或相邻时应保持原顺序', () => {
    expect(moveItem(['A', 'B', 'C'], 1, 1)).toEqual(['A', 'B', 'C'])
    expect(moveItem(['A', 'B', 'C'], 1, 2)).toEqual(['A', 'B', 'C'])
  })

  it('源下标非法时应保持原顺序', () => {
    expect(moveItem(['A', 'B'], -1, 1)).toEqual(['A', 'B'])
    expect(moveItem(['A', 'B'], 2, 0)).toEqual(['A', 'B'])
    expect(moveItem(['A', 'B'], 0.5, 1)).toEqual(['A', 'B'])
  })

  it('目标间隙越界时应夹取到合法范围', () => {
    expect(moveItem(['A', 'B', 'C'], 1, -5)).toEqual(['B', 'A', 'C'])
    expect(moveItem(['A', 'B', 'C'], 1, 99)).toEqual(['A', 'C', 'B'])
  })

  it('空数组应返回空数组', () => {
    expect(moveItem([], 0, 0)).toEqual([])
  })

  it('不应修改原数组', () => {
    const items = ['A', 'B', 'C']
    moveItem(items, 0, 2)
    expect(items).toEqual(['A', 'B', 'C'])
  })
})

describe('findInsertBefore', () => {
  const rects = [
    { left: 0, width: 100 },
    { left: 102, width: 100 },
    { left: 204, width: 100 }
  ]

  it('指针在第一个标签中点之前时应插入最前', () => {
    expect(findInsertBefore(rects, 10, -1)).toBe(0)
  })

  it('指针落在中点之后时应插入到下一个标签之前', () => {
    expect(findInsertBefore(rects, 120, -1)).toBe(1)
  })

  it('指针在最后一个标签中点之后时应插入末尾', () => {
    expect(findInsertBefore(rects, 300, -1)).toBe(3)
  })

  it('指针位于被拖拽标签自身区域时应返回不改变顺序的间隙', () => {
    expect(findInsertBefore(rects, 110, 1)).toBe(2)
  })

  it('指针在拖拽标签左侧时应插入到它之前', () => {
    expect(findInsertBefore(rects, 10, 1)).toBe(0)
  })
})
