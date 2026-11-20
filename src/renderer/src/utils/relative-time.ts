/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 把时间戳换算为相对时间的单位与数值，供标签总览等界面展示
 */

/** 相对时间的展示单位；`earlier` 表示时间戳缺失，`date` 表示直接展示日期 */
export type RelativeTimeUnit = 'justNow' | 'minute' | 'hour' | 'day' | 'date' | 'earlier'

export interface RelativeTimeParts {
  unit: RelativeTimeUnit
  /** 对应单位的数量；`justNow` / `earlier` 为 0，`date` 为原始时间戳 */
  value: number
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DATE_AFTER_DAYS = 7

/**
 * 计算相对时间的展示单位。
 * - 时间戳非法或为 0（会话补齐的历史项）→ `earlier`
 * - 未满 1 分钟或时间戳在未来（时钟回拨）→ `justNow`
 * - 1 分钟 ~ 1 小时 → `minute`；1 小时 ~ 1 天 → `hour`；1 天 ~ 7 天 → `day`
 * - 超过 7 天 → `date`，由调用方按当前语言格式化为日期
 */
export function relativeTimeParts(timestamp: number, now: number): RelativeTimeParts {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { unit: 'earlier', value: 0 }
  if (!Number.isFinite(now) || now <= timestamp) return { unit: 'justNow', value: 0 }

  const seconds = Math.floor((now - timestamp) / 1000)
  if (seconds < MINUTE) return { unit: 'justNow', value: 0 }

  const minutes = Math.floor(seconds / MINUTE)
  if (minutes < 60) return { unit: 'minute', value: minutes }

  const hours = Math.floor(seconds / HOUR)
  if (hours < 24) return { unit: 'hour', value: hours }

  const days = Math.floor(seconds / DAY)
  if (days < DATE_AFTER_DAYS) return { unit: 'day', value: days }

  return { unit: 'date', value: timestamp }
}
