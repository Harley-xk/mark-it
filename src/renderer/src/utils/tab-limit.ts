/*
 * 作者: Harley-xk
 * 创建: 2026-11-23
 *
 * 描述: 单窗口标签数量上限与剩余额度计算
 */

/** 单窗口最多同时打开的标签数；按编辑窗口独立计算，固定不可配置 */
export const MAX_TABS_PER_WINDOW = 99

/**
 * 当前窗口还能新增多少个标签。
 * 非法输入按「空窗口」处理；已超过上限时返回 0（不会返回负数）。
 */
export function remainingTabSlots(currentCount: number): number {
  if (!Number.isFinite(currentCount) || currentCount < 0) return MAX_TABS_PER_WINDOW
  return Math.max(0, MAX_TABS_PER_WINDOW - Math.floor(currentCount))
}
