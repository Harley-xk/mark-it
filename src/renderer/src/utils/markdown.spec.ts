import { describe, expect, it } from 'vitest'
import { createMarkdownRenderer } from './markdown'

describe('Markdown 渲染器', () => {
  it('任务列表应输出 GitHub 规范的类名与复选框', () => {
    const html = createMarkdownRenderer().render('- [ ] 待办\n- [x] 已完成')

    expect(html).toContain('class="contains-task-list"')
    expect(html).toContain('class="task-list-item"')
    expect(html).toContain('class="task-list-item-checkbox"')
    expect(html).toContain('checked=""')
  })

  it('表格无需额外插件即可渲染', () => {
    const html = createMarkdownRenderer().render('| A | B |\n| --- | --- |\n| 1 | 2 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th>A</th>')
  })

  it('已知语言的代码块应输出 highlight.js 标记', () => {
    const html = createMarkdownRenderer().render('```js\nconst answer = 42\n```')

    expect(html).toContain('class="language-js"')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('hljs-number')
  })

  it('未知语言应保持纯文本代码块，不影响 Mermaid 识别', () => {
    const html = createMarkdownRenderer().render('```mermaid\ngraph TD\n```')

    expect(html).toContain('<pre><code class="language-mermaid">')
    expect(html).not.toContain('hljs-')
  })

  it('裸域名应自动转换为链接（保持升级前行为）', () => {
    const html = createMarkdownRenderer().render('访问 www.example.com 与 example.com')

    expect(html).toContain('<a href="http://www.example.com">www.example.com</a>')
    expect(html).toContain('<a href="http://example.com">example.com</a>')
  })

  it('中文标点应终止自动链接', () => {
    const html = createMarkdownRenderer().render('访问 https://example.com。')

    expect(html).toContain('<a href="https://example.com">https://example.com</a>。')
  })
})
