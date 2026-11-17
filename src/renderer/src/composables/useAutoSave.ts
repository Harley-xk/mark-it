/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 停止输入后静默写盘的可选自动保存，失败只在状态栏提示
 */
import { onUnmounted, watch } from 'vue'
import type { DocumentTab } from '../stores/documents'
import { useAppStore } from '../stores/app'
import { useDocumentsStore } from '../stores/documents'
import { useFile } from './useFile'
import { shouldAutoSave } from '../utils/auto-save'
import { describeFileError } from '../utils/file-errors'
import { useI18n } from '../i18n'

export function useAutoSave(): void {
  const app = useAppStore()
  const docs = useDocumentsStore()
  const { autoSaveDocument } = useFile()
  const { locale } = useI18n()

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  function eligibleDocs(): DocumentTab[] {
    return docs.docs.filter((doc) => shouldAutoSave(doc, app.autoSaveInterval))
  }

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /** 按当前间隔重新计时；关闭或无待保存内容时清除失败提示 */
  function schedule(): void {
    clearTimer()
    if (app.autoSaveInterval <= 0) {
      app.setAutoSaveFailure(null)
      return
    }
    if (eligibleDocs().length === 0) app.setAutoSaveFailure(null)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, app.autoSaveInterval * 1000)
  }

  async function run(): Promise<void> {
    if (running || app.autoSaveInterval <= 0) return
    const targets = eligibleDocs()
    if (targets.length === 0) {
      app.setAutoSaveFailure(null)
      return
    }

    running = true
    let failure: { path: string; reason: string } | null = null
    try {
      for (const target of targets) {
        // 逐个处理期间标签可能被关闭或状态变化，处理前重新判定
        const current = docs.getDoc(target.id)
        if (!current || !shouldAutoSave(current, app.autoSaveInterval)) continue
        const outcome = await autoSaveDocument(current)
        if (outcome.status === 'failed' && !failure) {
          failure = {
            path: outcome.path,
            reason: describeFileError(outcome.error, locale.value)
          }
        }
      }
      app.setAutoSaveFailure(failure)
    } catch (err) {
      console.error('Auto save failed:', err)
    } finally {
      running = false
    }
  }

  watch(
    () =>
      docs.docs.map((doc) => [
        doc.id,
        doc.path,
        doc.content,
        doc.isModified,
        doc.readOnly,
        doc.missing
      ]),
    schedule
  )
  watch(() => app.autoSaveInterval, schedule, { immediate: true })

  onUnmounted(clearTimer)
}
