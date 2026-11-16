// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeMarkdownHtml } from './sanitize'

/** 把清洗结果解析成 DOM，便于按元素 / 属性断言 */
function parse(html: string): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('sanitizeMarkdownHtml', () => {
  it('应移除脚本标签与事件属性', () => {
    const container = parse(
      sanitizeMarkdownHtml('<p>正文</p><script>alert(1)</script><img src="x" onerror="alert(2)">')
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')?.hasAttribute('onerror')).toBe(false)
    expect(container.textContent).toContain('正文')
  })

  it('应拦截 javascript 与 vbscript 链接', () => {
    const container = parse(
      sanitizeMarkdownHtml(
        '<a id="js" href="javascript:alert(1)">js</a><a id="vb" href="vbscript:msgbox(1)">vb</a>'
      )
    )

    expect(container.querySelector('#js')?.getAttribute('href') ?? '').not.toContain('javascript:')
    expect(container.querySelector('#vb')?.getAttribute('href') ?? '').not.toContain('vbscript:')
  })

  it('应移除 iframe、form 与 style 标签', () => {
    const container = parse(
      sanitizeMarkdownHtml(
        '<iframe src="https://example.com"></iframe><form action="/x"><input name="a"></form><style>body{display:none}</style><p>保留</p>'
      )
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('style')).toBeNull()
    expect(container.textContent).toContain('保留')
  })

  it('应保留内嵌 HTML 的安全子集', () => {
    const container = parse(
      sanitizeMarkdownHtml('<p>按键 <kbd>Ctrl</kbd> + <kbd>S</kbd>，<mark>高亮</mark></p>')
    )

    expect(container.querySelectorAll('kbd')).toHaveLength(2)
    expect(container.querySelector('mark')?.textContent).toBe('高亮')
  })

  it('应保留任务列表的 checkbox', () => {
    const container = parse(
      sanitizeMarkdownHtml(
        '<ul class="contains-task-list"><li class="task-list-item"><input class="task-list-item-checkbox" disabled="" type="checkbox"> 待办</li></ul>'
      )
    )

    const checkbox = container.querySelector('input[type="checkbox"]')
    expect(checkbox).not.toBeNull()
    expect(checkbox?.hasAttribute('disabled')).toBe(true)
    expect(checkbox?.className).toBe('task-list-item-checkbox')
  })

  it('应保留标题锚点 id 与 class', () => {
    const container = parse(
      sanitizeMarkdownHtml('<h2 id="heading-3" class="markdown-heading">标题</h2>')
    )

    const heading = container.querySelector('h2')
    expect(heading?.id).toBe('heading-3')
    expect(heading?.className).toBe('markdown-heading')
  })

  it('应保留本地图片与内嵌图片地址', () => {
    const local = 'markit-file://local/?p=C%3A%5Cdocs%5Ca.png'
    const container = parse(
      sanitizeMarkdownHtml(
        `<img id="local" src="${local}"><img id="data" src="data:image/png;base64,iVBORw0KGgo=">`
      )
    )

    expect(container.querySelector('#local')?.getAttribute('src')).toBe(local)
    expect(container.querySelector('#data')?.getAttribute('src')).toContain('data:image/png')
  })

  it('应保留 http、mailto、file 链接与相对路径', () => {
    const container = parse(
      sanitizeMarkdownHtml(
        '<a id="http" href="https://example.com">a</a>' +
          '<a id="mail" href="mailto:a@example.com">b</a>' +
          '<a id="file" href="file:///C:/docs/a.md">c</a>' +
          '<a id="rel" href="./a.md">d</a>' +
          '<a id="win" href="D:\\docs\\a.md">e</a>'
      )
    )

    expect(container.querySelector('#http')?.getAttribute('href')).toBe('https://example.com')
    expect(container.querySelector('#mail')?.getAttribute('href')).toBe('mailto:a@example.com')
    expect(container.querySelector('#file')?.getAttribute('href')).toContain('file:///')
    expect(container.querySelector('#rel')?.getAttribute('href')).toBe('./a.md')
    expect(container.querySelector('#win')?.getAttribute('href')).toContain('D:')
  })

  it('应移除 svg 上的事件属性', () => {
    const container = parse(
      sanitizeMarkdownHtml('<svg onload="alert(1)"><circle onmouseover="alert(2)"></circle></svg>')
    )

    expect(container.querySelector('svg')?.hasAttribute('onload')).toBe(false)
    expect(container.querySelector('circle')?.hasAttribute('onmouseover')).toBe(false)
  })
})
