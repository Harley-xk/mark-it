/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 跨平台文件路径归一化与比较，仅 Windows 大小写不敏感
 */

/** 只有 Windows 的文件系统默认大小写不敏感；Linux 上 A.md 与 a.md 是两个文件 */
const CASE_INSENSITIVE = window.api.platform === 'win32'

/**
 * 归一化路径：统一为正斜杠，Windows 下再转小写。
 * 与主进程 sameFilePath 使用同一套规则，避免两边对「同一文件」的判断不一致。
 */
export function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return CASE_INSENSITIVE ? normalized.toLowerCase() : normalized
}

/** 判断两个路径是否指向同一个文件（仅 Windows 忽略大小写与斜杠差异） */
export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b
  return normalizePath(a) === normalizePath(b)
}
