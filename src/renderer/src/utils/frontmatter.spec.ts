import { describe, expect, it } from 'vitest'
import { parseFrontmatter, renderFrontmatterTable } from './frontmatter'

describe('frontmatter 解析', () => {
  it('应解析基础键值并正确换算正文起始行', () => {
    const result = parseFrontmatter('---\ntitle: 示例\ntags: a, b\n---\n正文')

    expect(result.raw).toBe('title: 示例\ntags: a, b')
    expect(result.entries).toEqual([
      { key: 'title', value: '示例' },
      { key: 'tags', value: 'a, b' }
    ])
    expect(result.body).toBe('正文')
    expect(result.bodyStartLine).toBe(4)
  })

  it('应跳过 BOM 且只在首行是分隔线时解析', () => {
    const withBom = parseFrontmatter('﻿---\ntitle: x\n---\n正文')
    expect(withBom.entries).toEqual([{ key: 'title', value: 'x' }])
    expect(withBom.body).toBe('正文')

    expect(parseFrontmatter('前言\n---\ntitle: x\n---')).toEqual({
      raw: null,
      entries: [],
      body: '前言\n---\ntitle: x\n---',
      bodyStartLine: 0
    })
  })

  it('缺少结束分隔线时应按无 frontmatter 处理', () => {
    expect(parseFrontmatter('---\ntitle: x\n正文')).toEqual({
      raw: null,
      entries: [],
      body: '---\ntitle: x\n正文',
      bodyStartLine: 0
    })
  })

  it('应支持 | 保留换行与 > 折叠换行', () => {
    const literal = parseFrontmatter('---\ndesc: |\n  line1\n  line2\n---\n')
    expect(literal.entries[0].value).toBe('line1\nline2')

    const folded = parseFrontmatter('---\ndesc: >\n  line1\n  line2\n---\n')
    expect(folded.entries[0].value).toBe('line1 line2')
  })

  it('应把 frontmatter 渲染为转义后的表格', () => {
    const html = renderFrontmatterTable([{ key: 'title', value: '<b>&"' }])

    expect(html).toContain('class="frontmatter-table"')
    expect(html).toContain('&lt;b&gt;&amp;&quot;')
  })
})
