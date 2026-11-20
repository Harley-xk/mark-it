import { describe, expect, it } from 'vitest'
import { relativeTimeParts } from './relative-time'

const NOW = 1_800_000_000_000

describe('relativeTimeParts', () => {
  it('时间戳为 0 或非法时归为较早', () => {
    expect(relativeTimeParts(0, NOW)).toEqual({ unit: 'earlier', value: 0 })
    expect(relativeTimeParts(-1, NOW)).toEqual({ unit: 'earlier', value: 0 })
    expect(relativeTimeParts(Number.NaN, NOW)).toEqual({ unit: 'earlier', value: 0 })
    expect(relativeTimeParts(Number.POSITIVE_INFINITY, NOW)).toEqual({ unit: 'earlier', value: 0 })
  })

  it('未满 1 分钟以及未来时间都显示为刚刚', () => {
    expect(relativeTimeParts(NOW, NOW)).toEqual({ unit: 'justNow', value: 0 })
    expect(relativeTimeParts(NOW - 59_999, NOW)).toEqual({ unit: 'justNow', value: 0 })
    expect(relativeTimeParts(NOW + 60_000, NOW)).toEqual({ unit: 'justNow', value: 0 })
  })

  it('按整分钟取整，满 60 分钟进位为小时', () => {
    expect(relativeTimeParts(NOW - 60_000, NOW)).toEqual({ unit: 'minute', value: 1 })
    expect(relativeTimeParts(NOW - 59 * 60_000 - 59_999, NOW)).toEqual({
      unit: 'minute',
      value: 59
    })
    expect(relativeTimeParts(NOW - 60 * 60_000, NOW)).toEqual({ unit: 'hour', value: 1 })
  })

  it('满 24 小时进位为天，满 7 天退回日期', () => {
    expect(relativeTimeParts(NOW - 23 * 3_600_000, NOW)).toEqual({ unit: 'hour', value: 23 })
    expect(relativeTimeParts(NOW - 24 * 3_600_000, NOW)).toEqual({ unit: 'day', value: 1 })
    expect(relativeTimeParts(NOW - 7 * 86_400_000, NOW)).toEqual({
      unit: 'date',
      value: NOW - 7 * 86_400_000
    })
  })

  it('日期单位保留原始时间戳供调用方格式化', () => {
    const timestamp = NOW - 30 * 86_400_000
    expect(relativeTimeParts(timestamp, NOW)).toEqual({ unit: 'date', value: timestamp })
  })
})
