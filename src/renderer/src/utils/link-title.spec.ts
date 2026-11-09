import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import { installLinkTitles } from './link-title'

function render(source: string): string {
  const md = new MarkdownIt({ html: true, linkify: true })
  installLinkTitles(md)
  return md.render(source)
}

describe('链接悬停提示', () => {
  it('普通链接应把完整地址写入 title', () => {
    const html = render('[官方文档](https://example.com/docs)')

    expect(html).toContain('title="https://example.com/docs"')
  })

  it('链接自带说明时应保留说明并换行追加地址', () => {
    const html = render('[官方文档](https://example.com/docs "文档首页")')

    expect(html).toContain('title="文档首页\nhttps://example.com/docs"')
  })

  it('自动识别的裸网址也应带悬停提示', () => {
    const html = render('访问 https://example.com 查看')

    expect(html).toContain('title="https://example.com"')
  })

  it('页内锚点不应补充提示', () => {
    const html = render('[跳到第一节](#section-1)')

    expect(html).not.toContain('title=')
  })

  it('相对路径链接同样显示完整地址', () => {
    const html = render('[说明](./docs/README.md)')

    expect(html).toContain('title="./docs/README.md"')
  })

  it('图片与无链接文本不应被改动', () => {
    const html = render('![图](https://example.com/a.png)\n\n纯文本')

    expect(html).not.toContain('title=')
  })
})
