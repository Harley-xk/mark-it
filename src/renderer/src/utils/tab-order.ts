/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 标签拖拽排序的数组移动与插入位置计算
 */

/**
 * 把 fromIndex 的元素移动到 insertBefore 指定的间隙。
 * insertBefore 是移动前数组中的插入间隙（0..items.length）：
 * - 0 表示插到最前，items.length 表示插到最后；
 * - 移除源元素后目标间隙会前移一位，函数内部按此修正。
 *
 * 下标非法或移动后顺序不变时返回原顺序的副本。
 */
export function moveItem<T>(items: readonly T[], fromIndex: number, insertBefore: number): T[] {
  const length = items.length
  if (length === 0) return []
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= length) return items.slice()
  if (!Number.isFinite(insertBefore)) return items.slice()

  const gap = Math.min(Math.max(Math.floor(insertBefore), 0), length)
  const target = fromIndex < gap ? gap - 1 : gap
  if (target === fromIndex) return items.slice()

  const next = items.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(target, 0, moved)
  return next
}

/**
 * 根据标签矩形中点与指针横坐标计算插入间隙。
 * rects 按当前视觉顺序排列；draggingIndex 对应的标签不参与中点比较，
 * 指针落在它自身区域时会返回一个不会改变顺序的间隙。
 */
export function findInsertBefore(
  rects: readonly { left: number; width: number }[],
  pointerX: number,
  draggingIndex: number
): number {
  for (let i = 0; i < rects.length; i += 1) {
    if (i === draggingIndex) continue
    const rect = rects[i]
    if (pointerX < rect.left + rect.width / 2) return i
  }
  return rects.length
}
