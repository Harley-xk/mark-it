/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 文档扩展名判定与拖拽路径清洗，供最近打开与拖拽打开共用
 */
import { isAbsolute } from 'path'
import { normalizeGuardPath } from './path-guard'

/** 可打开的文档扩展名；与打开对话框的过滤器保持一致 */
export const DOCUMENT_FILE_EXTENSION = /\.(?:md|markdown|txt)$/i

/** 文档内链接允许在标签中打开的本地文档扩展名：仅限 Markdown */
export const LINKED_MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i

/** 一次拖拽最多处理的文件数，避免误拖整个目录造成大量读取 */
export const MAX_DROPPED_FILES = 20

export function isDocumentFile(filePath: string): boolean {
  return DOCUMENT_FILE_EXTENSION.test(filePath)
}

/**
 * 校验预览区链接传入的本地路径：
 * 只接受绝对路径且扩展名为 `.md` / `.markdown`，
 * 避免渲染进程借该入口读取任意文件。
 */
export function sanitizeLinkedMarkdownPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const filePath = value.trim()
  if (!filePath || !isAbsolute(filePath) || !LINKED_MARKDOWN_EXTENSION.test(filePath)) return null
  return filePath
}

/**
 * 清洗渲染进程传来的拖拽路径：
 * 只保留绝对路径、扩展名合法且不重复的条目，并限制数量。
 * preload 已通过 webUtils.getPathForFile 得到路径，这里仍做一次校验，
 * 避免 IPC 参数被伪造时把任意路径写进信任集合。
 */
export function sanitizeDroppedPaths(
  value: unknown,
  platform: NodeJS.Platform = process.platform,
  maxFiles = MAX_DROPPED_FILES
): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const filePath = item.trim()
    if (!filePath || !isAbsolute(filePath) || !isDocumentFile(filePath)) continue
    const key = normalizeGuardPath(filePath, platform)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(filePath)
    if (result.length >= maxFiles) break
  }
  return result
}
