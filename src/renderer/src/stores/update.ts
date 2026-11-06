import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UpdateState } from '../../../shared/update-types'

export const useUpdateStore = defineStore('update', () => {
  const state = ref<UpdateState>({
    status: 'idle',
    currentVersion: '',
    currentChannel: 'stable',
    betaUpdatesEnabled: false,
    forceUpdate: false
  })
  /** 是否展示更新提示卡片（设置页始终展示状态，不依赖此值） */
  const showNotice = ref(false)
  /** 用户选择「跳过」的版本，同一版本不再自动弹出（进度事件会持续刷新状态） */
  const dismissedVersion = ref<string | null>(null)
  let initialized = false
  let offState: (() => void) | null = null

  const isBusy = computed(
    () => state.value.status === 'checking' || state.value.status === 'downloading'
  )
  const hasUpdate = computed(
    () =>
      state.value.status === 'available' ||
      state.value.status === 'downloading' ||
      state.value.status === 'downloaded'
  )

  function apply(next: UpdateState): void {
    state.value = next
    const shouldNotice =
      next.status === 'available' || next.status === 'downloading' || next.status === 'downloaded'
    if (shouldNotice && next.latestVersion !== dismissedVersion.value) {
      showNotice.value = true
    }
  }

  function init(): void {
    if (initialized) return
    initialized = true
    offState = window.api.update.onState(apply)
    window.api.update.getState().then(apply)
  }

  /** 注销主进程状态监听（HMR / 组件卸载时调用，避免重复处理） */
  function dispose(): void {
    offState?.()
    offState = null
    initialized = false
  }

  async function check(): Promise<void> {
    // 手动检测：清除「跳过」记录，有更新时重新提示
    dismissedVersion.value = null
    apply(await window.api.update.check())
    if (state.value.status === 'available' || state.value.status === 'downloading') {
      showNotice.value = true
    }
  }

  async function download(): Promise<void> {
    apply(await window.api.update.download())
  }

  /** 切换「接收 Beta 版更新」：清空跳过记录，让新偏好下的结果重新提示 */
  async function setBetaEnabled(enabled: boolean): Promise<void> {
    dismissedVersion.value = null
    apply(await window.api.update.setBetaEnabled(enabled))
  }

  async function install(): Promise<boolean> {
    return window.api.update.install()
  }

  /** 打开更新详情窗口 */
  async function openWindow(): Promise<void> {
    await window.api.update.openWindow()
  }

  /** 更新详情窗口请求安装：交给主窗口处理未保存内容 */
  async function requestInstall(): Promise<boolean> {
    return window.api.update.requestInstall()
  }

  function dismiss(): void {
    // 强制更新不允许关闭提示
    if (state.value.forceUpdate && hasUpdate.value) return
    dismissedVersion.value = state.value.latestVersion ?? null
    showNotice.value = false
  }

  return {
    state,
    showNotice,
    isBusy,
    hasUpdate,
    init,
    dispose,
    check,
    download,
    setBetaEnabled,
    install,
    openWindow,
    requestInstall,
    dismiss
  }
})
