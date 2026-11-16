/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 文件打开 / 保存失败与只读提示的统一对话框入口
 */
import type { FileOpenFailure, FileReadResult } from '../../../shared/file-types'
import { formatOpenFailureList, formatReadNotices } from '../utils/file-errors'
import { useI18n } from '../i18n'
import { confirmUnsaved } from './useConfirmUnsaved'

/** 提示信息对话框：只有一个「知道了」按钮 */
async function showInfo(title: string, message: string): Promise<void> {
  if (!message) return
  const { t } = useI18n()
  await confirmUnsaved(title, message, { save: t('common.gotIt') }, true, { hideDiscard: true })
}

export async function showFileOpenFailures(failures: FileOpenFailure[]): Promise<void> {
  const { locale, t } = useI18n()
  await showInfo(t('file.openFailuresTitle'), formatOpenFailureList(failures, locale.value))
}

export async function showFileReadNotices(files: FileReadResult[]): Promise<void> {
  const { locale, t } = useI18n()
  await showInfo(t('file.readNoticesTitle'), formatReadNotices(files, locale.value))
}

export async function showFileFailureMessage(title: string, message: string): Promise<void> {
  await showInfo(title, message)
}
