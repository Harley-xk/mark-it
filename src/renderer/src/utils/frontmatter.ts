/**
 * Markdown 文档头部的 YAML frontmatter 解析。
 *
 * 只支持预览展示所需的 YAML 子集：顶层的 `key: value`、引号字符串、
 * `|` / `>` 多行块，以及缩进续行（嵌套结构按原样多行展示）。
 * 复杂结构不要求语义完整，目标是在预览中呈现为可读的表格。
 */

export interface FrontmatterEntry {
  key: string
  value: string
}

export interface ParsedFrontmatter {
  /** frontmatter 原文（不含首尾分隔线）；不存在时为 null */
  raw: string | null
  entries: FrontmatterEntry[]
  /** 去掉 frontmatter 后的 Markdown 正文 */
  body: string
  /** 正文第一行在原文中的 0 基行号（用于把正文行号换算回原文档） */
  bodyStartLine: number
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function parseEntries(raw: string): FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = []
  let current: FrontmatterEntry | null = null
  // `|` 保留换行，`>` 折叠为空格
  let blockMode: 'literal' | 'folded' | null = null

  const appendContinuation = (content: string): void => {
    if (!current) return
    if (!current.value) {
      current.value = content
    } else if (blockMode === 'folded') {
      current.value += ' ' + content
    } else {
      current.value += '\n' + content
    }
  }

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue

    // 顶格注释行（YAML 注释），缩进的 # 视为值的一部分
    if (/^#/.test(line)) continue

    if (/^\s/.test(line)) {
      if (current) appendContinuation(line.replace(/^\s+/, ''))
      continue
    }

    const separator = line.indexOf(':')
    if (separator <= 0) continue

    const key = unquote(line.slice(0, separator))
    const rawValue = line.slice(separator + 1).trim()

    if (/^[|>][-+]?$/.test(rawValue)) {
      blockMode = rawValue.startsWith('|') ? 'literal' : 'folded'
      current = { key, value: '' }
    } else {
      blockMode = null
      current = { key, value: unquote(rawValue) }
    }
    entries.push(current)
  }

  return entries
}

/** 解析文档开头的 frontmatter；不存在时 body 与原文一致 */
export function parseFrontmatter(source: string): ParsedFrontmatter {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const lines = text.split(/\r?\n/)

  // 首行必须是分隔线，且存在成对的结束分隔线（--- 或 ...）
  if (lines[0].trim() !== '---') {
    return { raw: null, entries: [], body: text, bodyStartLine: 0 }
  }

  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '---' || line === '...') {
      end = i
      break
    }
  }
  if (end === -1) return { raw: null, entries: [], body: text, bodyStartLine: 0 }

  const raw = lines.slice(1, end).join('\n')
  return {
    raw,
    entries: parseEntries(raw),
    body: lines.slice(end + 1).join('\n'),
    bodyStartLine: end + 1
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** 把 frontmatter 渲染成预览中的属性表格（HTML 片段） */
export function renderFrontmatterTable(entries: FrontmatterEntry[]): string {
  if (entries.length === 0) return ''

  const rows = entries
    .map(
      ({ key, value }) =>
        `<tr><td class="fm-key">${escapeHtml(key)}</td>` +
        `<td class="fm-value">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  return (
    '<div class="frontmatter-block">' +
    '<div class="frontmatter-title">文档信息</div>' +
    '<table class="frontmatter-table">' +
    '<thead><tr><th>属性</th><th>值</th></tr></thead>' +
    `<tbody>${rows}</tbody>` +
    '</table></div>'
  )
}
