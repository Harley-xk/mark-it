/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 最近打开条目的路径展示辅助
 */

/** 取文件所在目录（同时支持 / 与 \）；没有目录部分时返回空串 */
export function directoryOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return ''
  return normalized.slice(0, index)
}
