import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { installHeadingAnchors, parseHeadings } from './headings'

describe('标题解析', () => {
  it('应同时识别 ATX 与 Setext 标题', () => {
    const headings = parseHeadings('Setext\n===\n\n# ATX\n\nSub\n---')

    expect(headings.map((heading) => [heading.level, heading.text])).toEqual([
      [1, 'Setext'],
      [1, 'ATX'],
      [2, 'Sub']
    ])
    expect(headings.map((heading) => heading.line)).toEqual([1, 4, 6])
  })

  it('代码块内的 # 不应被当作标题', () => {
    const headings = parseHeadings('```\n# 不是标题\n```\n\n## 真标题')

    expect(headings).toHaveLength(1)
    expect(headings[0].text).toBe('真标题')
  })

  it('标题文本应忽略强调与行内代码标记', () => {
    const headings = parseHeadings('# **粗体** 与 `code`')

    expect(headings[0].text).toBe('粗体 与 code')
  })
})

describe('标题锚点', () => {
  it('应按文档顺序注入 heading-N 锚点', () => {
    const md = new MarkdownIt()
    installHeadingAnchors(md)

    const html = md.render('# A\n\n## B\n\n# C')

    expect(html).toContain('id="heading-0"')
    expect(html).toContain('id="heading-1"')
    expect(html).toContain('id="heading-2"')
  })
})
