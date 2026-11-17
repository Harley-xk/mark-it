import { describe, expect, it } from 'vitest'
import { directoryOf } from './recent-files'

describe('directoryOf', () => {
  it('应返回正斜杠与反斜杠路径的目录部分', () => {
    expect(directoryOf('D:/notes/a.md')).toBe('D:/notes')
    expect(directoryOf('D:\\notes\\sub\\a.md')).toBe('D:/notes/sub')
    expect(directoryOf('/home/user/a.md')).toBe('/home/user')
  })

  it('没有目录部分时返回空串', () => {
    expect(directoryOf('a.md')).toBe('')
    expect(directoryOf('/a.md')).toBe('')
  })
})
