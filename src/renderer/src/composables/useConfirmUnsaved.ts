import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useFile } from './useFile'

type ConfirmAction = 'save' | 'discard' | 'cancel'

const showConfirm = ref(false)
const pendingResolve = ref<((action: ConfirmAction) => void) | null>(null)
const confirmTitle = ref('未保存的修改')
const confirmMessage = ref('当前文件有未保存的修改，是否保存？')

/**
 * 检查未保存修改并弹出确认对话框
 * 返回用户选择: 'save' | 'discard' | 'cancel'
 */
export function confirmUnsaved(title?: string, message?: string): Promise<ConfirmAction> {
  const app = useAppStore()

  if (!app.isModified) {
    return Promise.resolve('discard')
  }

  if (title) confirmTitle.value = title
  if (message) confirmMessage.value = message

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
 * 在 composable 中使用确认状态
 */
export function useConfirmDialog() {
  return {
    showConfirm,
    confirmTitle,
    confirmMessage,
    resolveConfirm
  }
}

/**
 * 执行需要先检查未保存的操作
 * 如果有未保存修改会弹窗确认，保存后或丢弃后执行回调
 */
export function useConfirmBeforeAction() {
  const file = useFile()

  /**
   * 检查未保存并执行操作
   * @param action 确认后要执行的操作
   * @param title 确认弹窗标题
   * @param message 确认弹窗消息
   */
  async function proceed(
    action: () => void | Promise<void>,
    title?: string,
    message?: string
  ): Promise<boolean> {
    const result = await confirmUnsaved(title, message)

    if (result === 'cancel') return false

    if (result === 'save') {
      await file.saveFile()
    }

    // 保存或丢弃后执行操作
    await action()
    return true
  }

  return { proceed }
}
