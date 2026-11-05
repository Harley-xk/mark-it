/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 基于 markdown-it 的统一标题解析与锚点注入，供大纲、预览与 PDF 共用
 */
import MarkdownIt, { type MarkdownIt as MarkdownItInstance } from 'markdown-it'

type MarkdownToken = ReturnType<MarkdownItInstance['parse']>[number]

export interface ParsedHeading {
  /** 与预览锚点一致的顺序 id：heading-0、heading-1 …… */
  id: string
  level: number
  text: string
  /** 标题在正文中的 1 基行号（不含 frontmatter） */
  line: number
}

/** 解析标题时不需要额外语法能力，保持与预览一致的基础配置即可 */
const parser = new MarkdownIt({ html: true })

/** 从 inline token 中提取纯文本，忽略强调、链接等标记 */
function inlineText(token: MarkdownToken | undefined): string {
  if (!token?.children) return token?.content.replace(/[#*`~[\]]/g, '').trim() ?? ''
  let text = ''
  for (const child of token.children) {
    if (child.type === 'text' || child.type === 'code_inline' || child.type === 'image') {
      text += child.content
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      text += ' '
    }
  }
  return text.trim()
}

/**
 * 按 markdown-it 的解析结果收集标题（ATX 与 Setext 都支持，代码块内的 # 会被忽略）。
 * 标题顺序与预览注入的 heading-N 锚点严格一致。
 */
export function parseHeadings(body: string): ParsedHeading[] {
  const tokens = parser.parse(body, {})
  const headings: ParsedHeading[] = []
  let index = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'heading_open') continue

    headings.push({
      id: `heading-${index}`,
      level: Number(token.tag.slice(1)),
      text: inlineText(tokens[i + 1]),
      line: token.map ? token.map[0] + 1 : 1
    })
    index += 1
  }

  return headings
}

/** 给预览 / PDF 的标题按文档顺序注入 heading-N 锚点 */
export function installHeadingAnchors(md: MarkdownItInstance): void {
  md.core.ruler.push('heading_anchor_ids', (state) => {
    let index = 0
    for (const token of state.tokens) {
      if (token.type === 'heading_open') {
        token.attrSet('id', `heading-${index}`)
        index += 1
      }
    }
    return true
  })
}
