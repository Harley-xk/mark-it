/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 文件错误码到可读提示、失败列表与只读提示的格式化
 */
import type {
  FileIoError,
  FileIoErrorCode,
  FileOpenFailure,
  FileOpenNotice,
  FileReadResult
} from '../../../shared/file-types'
import type { Locale } from '../../../shared/locale-types'
import { translate, type MessageKey } from '../../../i18n'

const ERROR_KEYS: Record<Exclude<FileIoErrorCode, 'io-error'>, MessageKey> = {
  'not-found': 'file.error.notFound',
  'permission-denied': 'file.error.permissionDenied',
  'is-directory': 'file.error.isDirectory',
  'too-large': 'file.error.tooLarge',
  'disk-full': 'file.error.diskFull',
  'read-only-filesystem': 'file.error.readOnlyFilesystem',
  'invalid-path': 'file.error.invalidPath',
  'not-trusted': 'file.error.notTrusted',
  'protected-path': 'file.error.protectedPath'
}

/** 单个错误的用户可读说明；未知 IO 错误保留系统原始信息作为细节 */
export function describeFileError(error: FileIoError, locale: Locale): string {
  if (error.code !== 'io-error') return translate(locale, ERROR_KEYS[error.code])
  return error.message || translate(locale, 'file.error.unknown')
}

/** 失败列表：最多展示 max 条，其余折叠为数量提示 */
export function formatOpenFailureList(
  failures: FileOpenFailure[],
  locale: Locale,
  max = 6
): string {
  if (failures.length === 0) return ''
  const visible = failures.slice(0, max)
  const lines = visible.map(
    (failure) => `${failure.path}\n  ${describeFileError(failure.error, locale)}`
  )
  if (failures.length > visible.length) {
    lines.push(translate(locale, 'file.moreFailures', { count: failures.length - visible.length }))
  }
  return lines.join('\n')
}

function noticeText(notice: FileOpenNotice, file: FileReadResult, locale: Locale): string {
  if (notice === 'non-utf8') {
    const encoding =
      file.encoding === 'unsupported'
        ? translate(locale, 'file.nonUtf8')
        : file.encoding.toUpperCase()
    return translate(locale, 'file.noticeNonUtf8', { path: file.path, encoding })
  }
  return translate(locale, 'file.noticeLargeFile', { path: file.path })
}

/** 一次打开多个文件时合并只读提示，避免连续弹窗 */
export function formatReadNotices(files: FileReadResult[], locale: Locale): string {
  const lines: string[] = []
  for (const file of files) {
    for (const notice of file.notices) lines.push(noticeText(notice, file, locale))
  }
  return lines.join('\n\n')
}
