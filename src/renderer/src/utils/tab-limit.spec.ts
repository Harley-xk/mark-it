import { describe, expect, it } from 'vitest'
import { MAX_TABS_PER_WINDOW, remainingTabSlots } from './tab-limit'

describe('remainingTabSlots', () => {
  it('空窗口返回完整额度', () => {
    expect(remainingTabSlots(0)).toBe(MAX_TABS_PER_WINDOW)
  })

  it('接近上限时返回剩余数量', () => {
    expect(remainingTabSlots(98)).toBe(1)
  })

  it('达到或超过上限时返回 0', () => {
    expect(remainingTabSlots(99)).toBe(0)
    expect(remainingTabSlots(120)).toBe(0)
  })

  it('非法输入按空窗口处理', () => {
    expect(remainingTabSlots(Number.NaN)).toBe(MAX_TABS_PER_WINDOW)
    expect(remainingTabSlots(-3)).toBe(MAX_TABS_PER_WINDOW)
  })

  it('上限固定为 99', () => {
    expect(MAX_TABS_PER_WINDOW).toBe(99)
  })
})
