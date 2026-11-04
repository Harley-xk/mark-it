import { describe, expect, it } from 'vitest'
import { diffLines } from './text-diff'

describe('diffLines', () => {
  it('应将 CRLF 与 LF 视为相同内容', () => {
    expect(diffLines('a\r\nb', 'a\nb')).toEqual([
      { type: 'context', text: 'a' },
      { type: 'context', text: 'b' }
    ])
  })

  it('应正确标注新增与删除行', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'context', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'context', text: 'c' }
    ])
  })

  it('相同行过多时应折叠为 gap 并保留首尾上下文', () => {
    const common = Array.from({ length: 10 }, (_, index) => `line-${index}`)
    const result = diffLines([...common, 'old'].join('\n'), [...common, 'new'].join('\n'))
    const gap = result.find((line) => line.type === 'gap')

    expect(result.slice(0, 3).map((line) => line.text)).toEqual(common.slice(0, 3))
    expect(gap?.count).toBe(common.length - 6)
    expect(result.filter((line) => line.type === 'remove')).toEqual([
      { type: 'remove', text: 'old' }
    ])
    expect(result.filter((line) => line.type === 'add')).toEqual([{ type: 'add', text: 'new' }])
  })

  it('超大差异应退化为整段删除加整段新增而不崩溃', () => {
    const oldText = Array.from({ length: 2001 }, (_, index) => `old-${index}`).join('\n')
    const newText = Array.from({ length: 2001 }, (_, index) => `new-${index}`).join('\n')
    const result = diffLines(oldText, newText)

    expect(result.filter((line) => line.type === 'remove')).toHaveLength(2001)
    expect(result.filter((line) => line.type === 'add')).toHaveLength(2001)
  })
})
