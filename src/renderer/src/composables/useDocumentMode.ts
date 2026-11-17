/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 编辑中跨过纯文本阈值时提示用户切换纯文本模式
 */
import { watch } from 'vue'
import { useDocumentsStore } from '../stores/documents'
import { confirmUnsaved } from './useConfirmUnsaved'
import { useI18n } from '../i18n'

/**
 * 预览阈值可以在编辑中自动降级；纯文本阈值会影响高亮与大纲，
 * 因此只提示、不自动切换，由用户确认后生效。
 */
export function useDocumentMode(): void {
  const docs = useDocumentsStore()
  const { t } = useI18n()
  /** 正在弹窗的标签：避免连续按键把同一个提示重复排进确认队列 */
  const prompting = new Set<string>()

  watch(
    () => {
      const doc = docs.activeDoc
      if (!doc) return null
      return { id: doc.id, name: doc.name, suggested: doc.plainSuggested }
    },
    async (state) => {
      if (!state?.suggested || prompting.has(state.id)) return
      prompting.add(state.id)
      const action = await confirmUnsaved(
        t('file.mode.switchToPlainTitle'),
        t('file.mode.switchToPlain', { name: state.name }),
        { save: t('file.mode.switchToPlainAction') },
        true,
        { hideDiscard: true, cancelText: t('common.cancel') }
      )
      prompting.delete(state.id)
      if (action === 'save') docs.switchToPlainMode(state.id)
      else docs.dismissPlainSuggestion(state.id)
    }
  )
}
