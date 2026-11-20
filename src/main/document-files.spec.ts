import { describe, expect, it } from 'vitest'
import { isDocumentFile, sanitizeDroppedPaths, sanitizeLinkedMarkdownPath } from './document-files'

describe('isDocumentFile', () => {
  it('只接受 md / markdown / txt 扩展名', () => {
    expect(isDocumentFile('C:/notes/a.md')).toBe(true)
    expect(isDocumentFile('C:/notes/a.MARKDOWN')).toBe(true)
    expect(isDocumentFile('C:/notes/a.txt')).toBe(true)
    expect(isDocumentFile('C:/notes/a.png')).toBe(false)
    expect(isDocumentFile('C:/notes/a.md.bak')).toBe(false)
  })
})

describe('sanitizeDroppedPaths', () => {
  it('应丢弃非数组、非字符串、相对路径与非文档扩展名', () => {
    const result = sanitizeDroppedPaths(
      ['/notes/a.md', 42, null, 'relative/b.md', '/notes/c.png', '/notes/d.txt'],
      'win32'
    )
    expect(result).toEqual(['/notes/a.md', '/notes/d.txt'])
  })

  it('应按路径归一化去重（Windows 忽略大小写）', () => {
    const result = sanitizeDroppedPaths(['/notes/A.md', '/NOTES/a.MD', '/notes/b.md'], 'win32')
    expect(result).toEqual(['/notes/A.md', '/notes/b.md'])
  })

  it('应限制单次拖拽的文件数量', () => {
    const paths = Array.from({ length: 30 }, (_, index) => `/notes/${index}.md`)
    expect(sanitizeDroppedPaths(paths, 'win32')).toHaveLength(20)
    expect(sanitizeDroppedPaths(paths, 'win32', 3)).toEqual([
      '/notes/0.md',
      '/notes/1.md',
      '/notes/2.md'
    ])
  })

  it('应去掉路径首尾空白', () => {
    expect(sanitizeDroppedPaths(['  /notes/a.md  '], 'win32')).toEqual(['/notes/a.md'])
  })
})

describe('sanitizeLinkedMarkdownPath', () => {
  it('只接受绝对路径且扩展名为 md / markdown', () => {
    expect(sanitizeLinkedMarkdownPath('/notes/a.md')).toBe('/notes/a.md')
    expect(sanitizeLinkedMarkdownPath('  /notes/a.MARKDOWN  ')).toBe('/notes/a.MARKDOWN')
    expect(sanitizeLinkedMarkdownPath('relative/a.md')).toBeNull()
    expect(sanitizeLinkedMarkdownPath('/notes/a.txt')).toBeNull()
    expect(sanitizeLinkedMarkdownPath('https://example.com/a.md')).toBeNull()
    expect(sanitizeLinkedMarkdownPath(null)).toBeNull()
  })
})
