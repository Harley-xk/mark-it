import { describe, expect, it } from 'vitest'
import { normalizePath, samePath } from './path'

describe('路径归一化', () => {
  it('Windows 下应同时忽略大小写与斜杠差异', () => {
    expect(normalizePath('C:\\Docs\\A.MD', true)).toBe('c:/docs/a.md')
    expect(samePath('C:\\Docs\\A.md', 'c:/docs/a.md', true)).toBe(true)
  })

  it('非 Windows 平台应保留大小写', () => {
    expect(normalizePath('C:\\Docs\\A.md', false)).toBe('C:/Docs/A.md')
    expect(samePath('/docs/A.md', '/docs/a.md', false)).toBe(false)
  })

  it('任一路径为空时应按严格相等判断', () => {
    expect(samePath(null, null, true)).toBe(true)
    expect(samePath(null, '/docs/a.md', true)).toBe(false)
    expect(samePath('', '', true)).toBe(true)
  })
})
