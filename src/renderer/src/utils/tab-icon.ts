/*
 * 作者: Harley-xk
 * 创建: 2026-11-23
 *
 * 描述: 标签图标的文件名首字符提取与自动命名空白文档判定
 */

/** 自动命名的空白文档：untitled.md / untitled-2.md / untitled.markdown 等 */
const UNTITLED_NAME = /^untitled(-\d+)?(\.[a-z0-9]+)?$/i

const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** 按 Unicode 字素迭代：优先使用 Intl.Segmenter，缺失时退化为码点拆分 */
function* graphemes(text: string): Generator<string> {
  if (graphemeSegmenter) {
    for (const part of graphemeSegmenter.segment(text)) yield part.segment
    return
  }
  for (const char of Array.from(text)) yield char
}

/** 去掉最后一个扩展名；点开头的隐藏文件与无扩展名文件原样返回 */
export function stripExtension(name: string): string {
  const trimmed = name.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return trimmed
  return trimmed.slice(0, dot)
}

/**
 * 标签图标使用的文件名首字符：
 * 去掉扩展名后取第一个非空白、非标点的字素，拉丁字母转大写；没有可用字符时返回 `?`。
 */
export function tabIconLetter(name: string): string {
  const base = stripExtension(name)
  for (const grapheme of graphemes(base)) {
    if (/^[\s\p{P}]$/u.test(grapheme)) continue
    return grapheme.toUpperCase()
  }
  return '?'
}

/** 是否为自动命名的空白文档；这类标签使用通用文档图标而不是首字符 */
export function isUntitledName(name: string): boolean {
  return UNTITLED_NAME.test(name.trim())
}
