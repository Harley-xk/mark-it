/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 解析本地文档链接中的行号与 GitHub 风格标题锚点，供打开定位与页内跳转复用
 */
import { parseFrontmatter } from './frontmatter'
import { parseHeadings, type ParsedHeading } from './headings'

/** 从链接地址拆出的文件路径与定位信息 */
export interface LinkLocation {
  /** 去掉查询串、片段与 `:line[:col]` 行号后缀后的地址 */
  href: string
  /** `#` 之后的原始片段（未解码）；没有片段时为 null */
  fragment: string | null
  /** 路径后缀中的行号（1 基） */
  line: number | null
  /** 路径后缀中的列号（1 基） */
  column: number | null
}

/** 定位主责：标题锚点由预览区负责，行号由编辑区负责，避免两侧互相覆盖 */
export type LinkTargetKind = 'heading' | 'line'

/** 解析后的定位目标：编辑器行号与预览锚点可以同时存在 */
export interface ResolvedLinkTarget {
  kind: LinkTargetKind
  /** 文档内显式 id（片段原文），预览层可据此命中自定义锚点 */
  anchorId: string | null
  /** GitHub slug 解析出的标题锚点（`heading-N`） */
  headingId: string | null
  /** 编辑器定位行号（1 基，含 frontmatter 偏移） */
  line: number
  /** 编辑器定位列号（1 基） */
  column: number
}

/** `a.md:12` / `a.md:12:5` 行号后缀，只对 Markdown 文档生效 */
const LINE_SUFFIX = /^(.*\.(?:md|markdown)):(\d+)(?::(\d+))?$/i
/** GitHub 风格行号片段：`#L12` / `#L12-L20` */
const LINE_FRAGMENT = /^L(\d+)(?:-L\d+)?$/i
/** 预览内部的顺序锚点：`#heading-3` */
const HEADING_ID_FRAGMENT = /^heading-(\d+)$/i

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * 拆分链接地址：文件路径、片段与行号后缀。
 * 片段与查询串不属于文件系统路径，行号后缀只在 Markdown 目标上识别，
 * 避免误伤文件名本身含冒号的普通文件。
 */
export function splitLinkLocation(rawHref: string): LinkLocation {
  let rest = rawHref.trim()
  let fragment: string | null = null

  const hashIndex = rest.indexOf('#')
  if (hashIndex >= 0) {
    fragment = rest.slice(hashIndex + 1)
    rest = rest.slice(0, hashIndex)
  }

  const queryIndex = rest.indexOf('?')
  if (queryIndex >= 0) rest = rest.slice(0, queryIndex)

  let line: number | null = null
  let column: number | null = null
  const suffix = LINE_SUFFIX.exec(rest)
  if (suffix) {
    rest = suffix[1]
    line = Number(suffix[2])
    column = suffix[3] ? Number(suffix[3]) : null
  }

  return { href: rest, fragment, line, column }
}

/** 按 GitHub 规则生成标题 slug：小写、去标点、空格转连字符，保留中文等字母数字 */
export function githubHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

/** 文档标题列表；行号已补上 frontmatter 占用的行数 */
function documentHeadings(content: string): ParsedHeading[] {
  const { body, bodyStartLine } = parseFrontmatter(content)
  return parseHeadings(body).map((heading) => ({
    ...heading,
    line: heading.line + bodyStartLine
  }))
}

/**
 * 把片段解析为标题：支持预览内部 `heading-N`、GitHub slug（重复标题按 `-1` 递增）
 * 与标题原文三种写法，返回 null 表示文档里没有对应标题。
 */
function resolveHeading(content: string, rawFragment: string): ParsedHeading | null {
  const fragment = safeDecode(rawFragment)
  const headings = documentHeadings(content)

  const indexMatch = HEADING_ID_FRAGMENT.exec(fragment)
  if (indexMatch) return headings[Number(indexMatch[1])] ?? null

  const counts = new Map<string, number>()
  for (const heading of headings) {
    const base = githubHeadingSlug(heading.text)
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    const slug = count === 0 ? base : `${base}-${count}`
    if (slug === fragment) return heading
  }

  return headings.find((heading) => heading.text === fragment) ?? null
}

/** 目标行之前（含自身）最近的标题，供预览模式按行号近似定位 */
function findHeadingAtOrBefore(content: string, line: number): ParsedHeading | null {
  let result: ParsedHeading | null = null
  for (const heading of documentHeadings(content)) {
    if (heading.line > line) break
    result = heading
  }
  return result
}

/**
 * 解析链接定位目标。
 * 行号优先取路径后缀 `:12`，其次取片段 `#L12`；没有定位信息时返回 null。
 */
export function resolveLinkTarget(
  content: string,
  location: LinkLocation
): ResolvedLinkTarget | null {
  const fragment = location.fragment ? safeDecode(location.fragment) : null
  const fragmentLine = fragment ? LINE_FRAGMENT.exec(fragment.trim()) : null
  const line = location.line ?? (fragmentLine ? Number(fragmentLine[1]) : null)

  if (line !== null) {
    const heading = findHeadingAtOrBefore(content, line)
    return {
      kind: 'line',
      anchorId: null,
      headingId: heading?.id ?? null,
      line,
      column: location.column ?? 1
    }
  }

  if (!fragment) return null

  const heading = resolveHeading(content, fragment)
  return {
    kind: 'heading',
    anchorId: fragment,
    headingId: heading?.id ?? null,
    line: heading?.line ?? 1,
    column: 1
  }
}
