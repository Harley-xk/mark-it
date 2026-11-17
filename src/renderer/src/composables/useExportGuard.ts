/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 大文件导出前的耗时确认与纯文本模式下的显式覆盖
 */
import type { DocumentTab } from '../stores/documents'
import { confirmUnsaved } from './useConfirmUnsaved'
import { useI18n } from '../i18n'

/**
 * 导出会重新构建完整 HTML 并与预览同源，大文件下需要把成本显式告知用户。
 * normal 直接放行；large 提示耗时；plain 默认拒绝，用户确认后才继续。
 */
export async function confirmExportForMode(doc: DocumentTab): Promise<boolean> {
  if (doc.mode === 'normal') return true

  const { t } = useI18n()
  const plain = doc.mode === 'plain'
  const action = await confirmUnsaved(
    plain ? t('export.plainFileBlockedTitle') : t('export.largeFileConfirmTitle'),
    plain
      ? t('export.plainFileBlocked', { name: doc.name })
      : t('export.largeFileConfirm', { name: doc.name }),
    { save: t('common.continue') },
    true,
    { hideDiscard: true, cancelText: t('common.cancel') }
  )
  return action === 'save'
}
