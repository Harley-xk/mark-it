import { describe, expect, it } from 'vitest'
import { LruCache } from './lru-cache'

describe('LruCache', () => {
  it('应在容量内保存并按访问顺序淘汰最久未使用的条目', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    // 访问 a 后 b 变成最久未使用
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)

    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  it('应刷新已有键的访问顺序且不增加容量', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10)

    expect(cache.size).toBe(2)
    cache.set('c', 3)
    expect(cache.get('a')).toBe(10)
    expect(cache.get('b')).toBeUndefined()
  })

  it('容量为 0 时不应保存任何条目', () => {
    const cache = new LruCache<string, number>(0)
    cache.set('a', 1)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('应支持删除与清空', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)

    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(1)

    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('b')).toBeUndefined()
  })
})
