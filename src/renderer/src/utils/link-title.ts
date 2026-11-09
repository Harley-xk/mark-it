/*
 * 作者: Harley-xk
 * 创建: 2026-11-09
 *
 * 描述: 为预览链接补充 title 属性，悬停时显示完整地址
 */
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'

/**
 * 给渲染出的链接补 `title`。
 *
 * - 无 title 时直接使用完整地址；
 * - 已有 title（`[文本](地址 "说明")`）时保留说明，并在换行后追加地址；
 * - 页内锚点（`#xxx`）不处理，避免显示无意义的片段标识。
 *
 * 只影响悬停提示，不改变链接的目标与点击分流。
 */
export function installLinkTitles(md: MarkdownItInstance): void {
  md.core.ruler.push('link_full_href_title', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue
      for (const child of token.children) {
        if (child.type !== 'link_open') continue
        const href = child.attrGet('href')
        if (typeof href !== 'string' || !href || href.startsWith('#')) continue
        const title = child.attrGet('title')
        child.attrSet('title', typeof title === 'string' && title ? `${title}\n${href}` : href)
      }
    }
    return true
  })
}
