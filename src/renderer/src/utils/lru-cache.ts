/*
 * 作者: Harley-xk
 * 创建: 2026-11-12
 *
 * 描述: 按访问顺序淘汰的 LRU 缓存，供预览 HTML 与图表 SVG 复用
 */

/**
 * 基于 Map 插入顺序实现的 LRU 缓存。
 * `get` 会刷新访问顺序，超出容量时淘汰最久未被访问的条目。
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>()
  private readonly maxEntries: number

  constructor(maxEntries: number) {
    this.maxEntries = Math.max(0, Math.floor(maxEntries))
  }

  get size(): number {
    return this.entries.size
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    // 重新插入：Map 保持插入顺序，这样末尾永远是最近访问的条目
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.maxEntries === 0) return
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  delete(key: K): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
