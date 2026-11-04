import { describe, expect, it } from 'vitest'
import { decodeText, encodeText, normalizeToLf } from './text-encoding'

describe('文本换行符与 BOM', () => {
  it('应拆分 BOM 并把 CRLF 统一为 LF', () => {
    expect(decodeText('﻿a\r\nb')).toEqual({ text: 'a\nb', eol: '\r\n', bom: true })
  })

  it('没有换行与 BOM 时应按 LF 处理', () => {
    expect(decodeText('单行')).toEqual({ text: '单行', eol: '\n', bom: false })
  })

  it('没有换行时也应记录原文件的 BOM', () => {
    expect(decodeText('﻿单行')).toEqual({ text: '单行', eol: '\n', bom: true })
  })

  it('保存时应按原换行符与 BOM 还原', () => {
    expect(encodeText('a\nb', '\r\n', true)).toBe('﻿a\r\nb')
    expect(encodeText('a\nb', '\n', false)).toBe('a\nb')
  })

  it('normalizeToLf 应同时处理 CRLF 与孤立 CR', () => {
    expect(normalizeToLf('a\r\nb\rc')).toBe('a\nb\nc')
  })
})
