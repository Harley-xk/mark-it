import { ref, type Ref } from 'vue'
import { useAppStore } from '../stores/app'
import type { DiffLine } from '../utils/text-diff'

type ConfirmAction = 'save' | 'discard' | 'cancel'

const showConfirm = ref(false)
const pendingResolve = ref<((action: ConfirmAction) => void) | null>(null)
const confirmTitle = ref('未保存的修改')
const confirmMessage = ref('当前文件有未保存的修改，是否保存？')
const confirmSaveText = ref('保存')
const confirmDiscardText = ref('放弃修改')
const confirmCancelText = ref('')
const confirmDiff = ref<DiffLine[]>([])

export interface ConfirmExtra {
  /** 提供后显示第三个「取消」按钮（默认只能通过关闭按钮 / 点击遮罩取消） */
  cancelText?: string
  /** 文件冲突时展示的逐行差异：remove = 磁盘内容，add = 本地内容 */
  diff?: DiffLine[]
}

interface ConfirmRequest {
  title?: string
  message?: string
  labels?: { save?: string; discard?: string }
  extra?: ConfirmExtra
  resolve: (action: ConfirmAction) => void
}

/** 多个确认请求排队显示：自动刷新冲突提示可能与关闭/保存确认同时到达 */
const requests: ConfirmRequest[] = []
let advanceTimer: ReturnType<typeof setTimeout> | null = null

/** 显示队列中的下一个请求；队列为空时关闭对话框 */
function showNextRequest(): void {
  const request = requests.shift()
  if (!request) {
    showConfirm.value = false
    return
  }

  confirmTitle.value = request.title || '未保存的修改'
  confirmMessage.value = request.message || '当前文件有未保存的修改，是否保存？'
  confirmSaveText.value = request.labels?.save || '保存'
  confirmDiscardText.value = request.labels?.discard || '放弃修改'
  confirmCancelText.value = request.extra?.cancelText || ''
  confirmDiff.value = request.extra?.diff || []
  pendingResolve.value = request.resolve
  showConfirm.value = true
}

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
  hasUnsaved?: boolean,
  extra?: ConfirmExtra
): Promise<ConfirmAction> {
  const app = useAppStore()

  if (!(hasUnsaved ?? app.isModified)) {
    return Promise.resolve('discard')
  }

  return new Promise<ConfirmAction>((resolve) => {
    requests.push({ title, message, labels, extra, resolve })
    // 已有对话框显示或正在等待展示下一个时排队，依次显示
    if (!showConfirm.value && !advanceTimer) showNextRequest()
  })
}

/**
 * 在确认对话框中触发用户选择
 */
export function resolveConfirm(action: ConfirmAction): void {
  const resolve = pendingResolve.value
  pendingResolve.value = null
  showConfirm.value = false
  resolve?.(action)
  // 稍后再展示下一个请求：双击按钮时第二下不会误触新对话框上相同位置的按钮
  if (advanceTimer) clearTimeout(advanceTimer)
  advanceTimer = setTimeout(() => {
    advanceTimer = null
    showNextRequest()
  }, 250)
}

/**
 * 在 composable 中使用确认对话框的状态
 */
export function useConfirmDialog(): {
  showConfirm: Ref<boolean>
  confirmTitle: Ref<string>
  confirmMessage: Ref<string>
  confirmSaveText: Ref<string>
  confirmDiscardText: Ref<string>
  confirmCancelText: Ref<string>
  confirmDiff: Ref<DiffLine[]>
  resolveConfirm: (action: ConfirmAction) => void
} {
  return {
    showConfirm,
    confirmTitle,
    confirmMessage,
    confirmSaveText,
    confirmDiscardText,
    confirmCancelText,
    confirmDiff,
    resolveConfirm
  }
}
