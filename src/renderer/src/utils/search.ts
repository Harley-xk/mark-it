/*
 * 作者: Harley-xk
 * 创建: 2026-11-09
 *
 * 描述: 文档内搜索的字面量匹配与预览区文本范围提取
 */

export interface TextMatch {
  from: number
  to: number
}

/**
 * 单次搜索最多定位的匹配数量。
 * 常见单字符在超长文档里可能命中数万次，全部生成装饰 / Range 会明显拖慢输入。
 * 超出部分不标注、不可导航，计数也停在上限（见 docs/编辑与预览/搜索与替换.md 第 4 节）。
 */
export const SEARCH_MATCH_LIMIT = 2000

const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'])

/** 文本节点所属的块级容器：不同容器之间拼接时插入边界，避免产生跨段落的假匹配 */
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,dt,dd,figcaption'

interface TextNodeEntry {
  node: Text
  start: number
  end: number
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 按字面量子串查找匹配位置。
 * 使用 RegExp.exec 的 index 作为偏移，避免 toLowerCase() 改变字符串长度导致位置错位。
 */
export function findTextMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
  limit = SEARCH_MATCH_LIMIT
): TextMatch[] {
  if (query.length === 0 || limit <= 0) return []

  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi')
  const matches: TextMatch[] = []
  let match: RegExpExecArray | null
  while (matches.length < limit && (match = pattern.exec(text)) !== null) {
    matches.push({ from: match.index, to: match.index + match[0].length })
    // query 非空时不会出现零宽匹配；仍显式前移，避免异常输入陷入死循环
    if (match[0].length === 0) pattern.lastIndex += 1
  }
  return matches
}

/** 文本节点所属的块级容器；找不到时归到根节点 */
function blockContainer(node: Node, root: HTMLElement): Node {
  let element = node.parentElement
  while (element && element !== root) {
    if (element.matches(BLOCK_SELECTOR)) return element
    element = element.parentElement
  }
  return root
}

/**
 * 把预览区可见文本节点拼成一条可检索文本，并记录每个节点对应的偏移区间。
 * 跳过脚本 / 表单控件与 SVG（Mermaid）内部文本。
 */
function collectTextEntries(root: HTMLElement): { text: string; entries: TextNodeEntry[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || SKIP_TEXT_PARENTS.has(parent.tagName) || parent.closest('svg')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const entries: TextNodeEntry[] = []
  let text = ''
  let lastBlock: Node | null = null

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? ''
    if (value.length === 0) continue

    const block = blockContainer(node, root)
    if (text.length > 0 && block !== lastBlock) {
      // 块级边界插入换行，阻止上一段结尾与下一段开头拼成假匹配
      text += '\n'
    }

    const start = text.length
    text += value
    entries.push({ node: node as Text, start, end: text.length })
    lastBlock = block
  }

  return { text, entries }
}

/** 二分查找包含指定偏移的文本节点；偏移落在块边界换行上时返回 null */
function findEntry(entries: TextNodeEntry[], offset: number): TextNodeEntry | null {
  let low = 0
  let high = entries.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const entry = entries[middle]
    if (offset < entry.start) high = middle - 1
    else if (offset >= entry.end) low = middle + 1
    else return entry
  }
  return null
}

/**
 * 在预览区渲染结果中查找匹配，返回可直接注册到 CSS Custom Highlight API 的 Range。
 * 跨行内格式（如 **Hello** world）会命中；跨块级元素不会命中。
 */
export function collectPreviewRanges(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean
): Range[] {
  if (query.length === 0) return []

  const { text, entries } = collectTextEntries(root)
  if (entries.length === 0) return []

  const ranges: Range[] = []
  for (const match of findTextMatches(text, query, caseSensitive)) {
    const startEntry = findEntry(entries, match.from)
    const endEntry = findEntry(entries, match.to - 1)
    // 命中块边界虚拟换行时跳过（查询框不接收换行，正常不会发生）
    if (!startEntry || !endEntry) continue

    const range = document.createRange()
    range.setStart(startEntry.node, match.from - startEntry.start)
    range.setEnd(endEntry.node, match.to - endEntry.start)
    ranges.push(range)
  }
  return ranges
}
