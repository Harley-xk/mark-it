import { describe, expect, it } from 'vitest'
import { deriveImageFileName, derivePdfFileName } from './pdf-name'

describe('derivePdfFileName', () => {
  it('应把 Markdown 扩展名替换为 pdf', () => {
    expect(derivePdfFileName('示例.md')).toBe('示例.pdf')
    expect(derivePdfFileName('notes.markdown')).toBe('notes.pdf')
    expect(derivePdfFileName('README.txt')).toBe('README.pdf')
  })

  it('应忽略扩展名大小写', () => {
    expect(derivePdfFileName('Report.MD')).toBe('Report.pdf')
  })

  it('无扩展名的文档应直接追加 pdf', () => {
    expect(derivePdfFileName('会议记录')).toBe('会议记录.pdf')
    expect(derivePdfFileName('a.b')).toBe('a.b.pdf')
  })

  it('文档名缺失或为空时应回退到 untitled，避免默认文件名为空', () => {
    expect(derivePdfFileName('')).toBe('untitled.pdf')
    expect(derivePdfFileName('   ')).toBe('untitled.pdf')
    expect(derivePdfFileName('.md')).toBe('untitled.pdf')
    expect(derivePdfFileName(null)).toBe('untitled.pdf')
    expect(derivePdfFileName(undefined)).toBe('untitled.pdf')
  })
})

describe('deriveImageFileName', () => {
  it('应把 Markdown 扩展名替换为 png', () => {
    expect(deriveImageFileName('示例.md')).toBe('示例.png')
    expect(deriveImageFileName('notes.markdown')).toBe('notes.png')
  })

  it('文档名缺失或为空时应回退到 untitled.png', () => {
    expect(deriveImageFileName('')).toBe('untitled.png')
    expect(deriveImageFileName(null)).toBe('untitled.png')
  })
})
