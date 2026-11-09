import { describe, expect, it } from 'vitest'
import { escapeRegExp, findTextMatches, SEARCH_MATCH_LIMIT } from './search'

describe('findTextMatches', () => {
  it('应按字面量返回全部匹配位置', () => {
    expect(findTextMatches('foo bar foo', 'foo', true)).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 }
    ])
  })

  it('忽略大小写时应匹配不同大小写的英文', () => {
    expect(findTextMatches('Mark mark MARK', 'mark', false)).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 },
      { from: 10, to: 14 }
    ])
  })

  it('区分大小写时只匹配完全一致的写法', () => {
    expect(findTextMatches('Mark mark MARK', 'mark', true)).toEqual([{ from: 5, to: 9 }])
  })

  it('应把正则元字符按字面量处理', () => {
    expect(findTextMatches('a.b axb a*b', 'a.b', true)).toEqual([{ from: 0, to: 3 }])
    expect(findTextMatches('a*b axb', 'a*b', true)).toEqual([{ from: 0, to: 3 }])
    expect(findTextMatches('a(b) aXb', 'a(b)', true)).toEqual([{ from: 0, to: 4 }])
  })

  it('空查询不产生匹配', () => {
    expect(findTextMatches('anything', '', false)).toEqual([])
  })

  it('应按字面量匹配中文', () => {
    expect(findTextMatches('搜索与替换：搜索面板', '搜索', true)).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 }
    ])
  })

  it('应返回不重叠的相邻匹配', () => {
    expect(findTextMatches('aaaa', 'aa', true)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 }
    ])
  })

  it('Unicode 字符的偏移应基于原始字符串', () => {
    expect(findTextMatches('İxİ', 'İ', true)).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 3 }
    ])
  })

  it('应限制单次搜索的最大匹配数量', () => {
    const text = 'a'.repeat(SEARCH_MATCH_LIMIT + 10)
    expect(findTextMatches(text, 'a', true)).toHaveLength(SEARCH_MATCH_LIMIT)
  })

  it('可通过 limit 参数进一步限制数量', () => {
    expect(findTextMatches('aaaa', 'a', true, 2)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 }
    ])
  })
})

describe('escapeRegExp', () => {
  it('应转义全部正则元字符', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
  })

  it('普通文本保持不变', () => {
    expect(escapeRegExp('hello 世界')).toBe('hello 世界')
  })
})
