/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 最近打开文件的侧车数据校验、去重与上限维护
 */
import { basename } from 'path'
import { isDocumentFile } from './document-files'
import { normalizeGuardPath } from './path-guard'

export const MAX_RECENT_FILES = 20

/** 侧车文件中的单条记录；missing 只在返回渲染进程时按磁盘状态计算 */
export interface RecentFileRecord {
  path: string
  name: string
  openedAt: number
}

/** `userData/recent-files.json` 的磁盘结构 */
export interface RecentFilesFile {
  version: 1
  files: RecentFileRecord[]
}

function normalizeRecord(value: unknown): RecentFileRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || !record.path || !isDocumentFile(record.path)) return null
  const name =
    typeof record.name === 'string' && record.name
      ? record.name
      : basename(record.path) || record.path
  const openedAt =
    typeof record.openedAt === 'number' && Number.isFinite(record.openedAt) && record.openedAt > 0
      ? record.openedAt
      : 0
  return { path: record.path, name, openedAt }
}

/**
 * 校验侧车文件并归一化：丢弃非法条目、按归一化路径去重、按打开时间倒序、截断到上限。
 * 任何结构不符都回落空列表，避免损坏文件变成任意路径清单。
 */
export function parseRecentFilesFile(
  value: unknown,
  platform: NodeJS.Platform = process.platform
): RecentFileRecord[] {
  if (!value || typeof value !== 'object') return []
  const data = value as Record<string, unknown>
  if (data.version !== 1 || !Array.isArray(data.files)) return []

  const seen = new Set<string>()
  const records: RecentFileRecord[] = []
  for (const item of data.files) {
    const record = normalizeRecord(item)
    if (!record) continue
    const key = normalizeGuardPath(record.path, platform)
    if (seen.has(key)) continue
    seen.add(key)
    records.push(record)
  }
  records.sort((a, b) => b.openedAt - a.openedAt)
  return records.slice(0, MAX_RECENT_FILES)
}

/**
 * 记录一次打开：同一路径只保留一条并移到最前，超出上限时丢弃最旧项。
 * 返回新数组，不修改入参。
 */
export function rememberRecentFile(
  records: readonly RecentFileRecord[],
  filePath: string,
  openedAt: number,
  platform: NodeJS.Platform = process.platform
): RecentFileRecord[] {
  if (!filePath || !isDocumentFile(filePath)) return [...records]
  const key = normalizeGuardPath(filePath, platform)
  const next = records
    .filter((record) => normalizeGuardPath(record.path, platform) !== key)
    .slice(0, MAX_RECENT_FILES - 1)
  return [{ path: filePath, name: basename(filePath) || filePath, openedAt }, ...next]
}

/** 构造侧车文件内容 */
export function buildRecentFilesFile(records: readonly RecentFileRecord[]): RecentFilesFile {
  return { version: 1, files: records.slice(0, MAX_RECENT_FILES) }
}
