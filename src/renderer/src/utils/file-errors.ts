/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 文件错误码到中文提示、失败列表与只读提示的格式化
 */
import type {
  FileIoError,
  FileOpenFailure,
  FileOpenNotice,
  FileReadResult
} from '../../../shared/file-types'

/** 单个错误的用户可读说明 */
export function describeFileError(error: FileIoError): string {
  switch (error.code) {
    case 'not-found':
      return '文件不存在或已被删除。'
    case 'permission-denied':
      return '没有读取或写入该文件的权限。'
    case 'is-directory':
      return '目标是一个目录，不是文件。'
    case 'too-large':
      return '文件超过 10 MiB，MarkIt 不支持打开这么大的文档。'
    case 'disk-full':
      return '磁盘空间不足。'
    case 'read-only-filesystem':
      return '目标磁盘或文件系统为只读。'
    case 'invalid-path':
      return '文件路径无效。'
    case 'not-trusted':
      return '该路径不是通过打开或保存操作选择的，已拒绝访问。'
    case 'protected-path':
      return '不允许写入应用自身目录或系统开机启动目录。'
    default:
      return error.message || '未知的文件错误。'
  }
}

/** 失败列表：最多展示 max 条，其余折叠为数量提示 */
export function formatOpenFailureList(failures: FileOpenFailure[], max = 6): string {
  if (failures.length === 0) return ''
  const visible = failures.slice(0, max)
  const lines = visible.map((failure) => `${failure.path}\n  ${describeFileError(failure.error)}`)
  if (failures.length > visible.length) {
    lines.push(`另有 ${failures.length - visible.length} 个文件未能打开。`)
  }
  return lines.join('\n')
}

function noticeText(notice: FileOpenNotice, file: FileReadResult): string {
  if (notice === 'non-utf8') {
    const encoding = file.encoding === 'unsupported' ? '非 UTF-8' : file.encoding.toUpperCase()
    return `${file.path}\n  编码为 ${encoding}，已以只读方式打开；保存时请使用「另存为」转为 UTF-8。`
  }
  return `${file.path}\n  文件超过 5 MiB，已以只读方式打开，且不会把正文写入会话恢复数据。`
}

/** 一次打开多个文件时合并只读提示，避免连续弹窗 */
export function formatReadNotices(files: FileReadResult[]): string {
  const lines: string[] = []
  for (const file of files) {
    for (const notice of file.notices) lines.push(noticeText(notice, file))
  }
  return lines.join('\n\n')
}
