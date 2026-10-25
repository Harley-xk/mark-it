import { ref } from 'vue'
import { useAppStore } from '../stores/app'

type ConfirmAction = 'save' | 'discard' | 'cancel'

const showConfirm = ref(false)
const pendingResolve = ref<((action: ConfirmAction) => void) | null>(null)
const confirmTitle = ref('未保存的修改')
const confirmMessage = ref('当前文件有未保存的修改，是否保存？')
const confirmSaveText = ref('保存')
const confirmDiscardText = ref('放弃修改')

/**
 * 检查未保存修改并弹出确认对话框
 * labels 可自定义"保存 / 放弃修改"两个按钮的文案
 * hasUnsaved 用于检查非当前标签页的修改状态，缺省检查当前标签页
 * 返回用户选择: 'save' | 'discard' | 'cancel'
 */
export function confirmUnsaved(
  title?: string,
  message?: string,
  labels?: { save?: string; discard?: string },
  hasUnsaved?: boolean
): Promise<ConfirmAction> {
  const app = useAppStore()

  if (!(hasUnsaved ?? app.isModified)) {
    return Promise.resolve('discard')
  }

  if (title) confirmTitle.value = title
  if (message) confirmMessage.value = message
  confirmSaveText.value = labels?.save || '保存'
  confirmDiscardText.value = labels?.discard || '放弃修改'

  showConfirm.value = true

  return new Promise<ConfirmAction>((resolve) => {
    pendingResolve.value = resolve
  })
}

/**
 * 在确认对话框中触发用户选择
 */
export function resolveConfirm(action: ConfirmAction) {
  showConfirm.value = false
  if (pendingResolve.value) {
    pendingResolve.value(action)
    pendingResolve.value = null
  }
}

/**
 * 在 composable 中使用确认对话框的状态
 */
export function useConfirmDialog() {
  return {
    showConfirm,
    confirmTitle,
    confirmMessage,
    confirmSaveText,
    confirmDiscardText,
    resolveConfirm
  }
}
