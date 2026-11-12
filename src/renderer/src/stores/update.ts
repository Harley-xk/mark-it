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
  /** 主进程下发的提示可显示策略：设置页检测与更新窗口打开期间为 false */
  const noticeAllowed = ref(true)
  /** 用户选择「跳过」的版本，同一版本不再自动弹出（进度事件会持续刷新状态） */
  const dismissedVersion = ref<string | null>(null)
  let initialized = false
  let offState: (() => void) | null = null
  let offNoticeAllowed: (() => void) | null = null

  const isBusy = computed(
    () => state.value.status === 'checking' || state.value.status === 'downloading'
  )
  const hasUpdate = computed(
    () =>
      state.value.status === 'available' ||
      state.value.status === 'downloading' ||
      state.value.status === 'downloaded'
  )
  /** 回退仅允许当前 Beta、受支持平台，且不处于检测 / 下载 / 已下载状态 */
  const canRollback = computed(
    () =>
      state.value.currentChannel === 'beta' &&
      window.api.platform !== 'darwin' &&
      (state.value.status === 'idle' ||
        state.value.status === 'available' ||
        state.value.status === 'not-available' ||
        state.value.status === 'error') &&
      (!state.value.isRollback || state.value.status === 'error')
  )
  const rollbackInProgress = computed(
    () =>
      state.value.isRollback === true &&
      (state.value.status === 'checking' ||
        state.value.status === 'available' ||
        state.value.status === 'downloading' ||
        state.value.status === 'downloaded')
  )

  function apply(next: UpdateState): void {
    state.value = next
    const shouldNotice =
      next.status === 'available' || next.status === 'downloading' || next.status === 'downloaded'
    if (shouldNotice && noticeAllowed.value && next.latestVersion !== dismissedVersion.value) {
      showNotice.value = true
    }
  }

  /** 跟随主进程策略：被抑制时立即隐藏已有提示，恢复时只解除抑制、不主动弹卡 */
  function applyNoticeAllowed(allowed: boolean): void {
    noticeAllowed.value = allowed
    if (!allowed) showNotice.value = false
  }

  function init(): void {
    if (initialized) return
    initialized = true
    offState = window.api.update.onState(apply)
    offNoticeAllowed = window.api.update.onNoticeAllowed(applyNoticeAllowed)
    window.api.update.getState().then(apply)
  }

  /** 注销主进程状态监听（HMR / 组件卸载时调用，避免重复处理） */
  function dispose(): void {
    offState?.()
    offState = null
    offNoticeAllowed?.()
    offNoticeAllowed = null
    initialized = false
  }

  async function check(): Promise<void> {
    // 手动检测：清除「跳过」记录，有更新时重新提示
    dismissedVersion.value = null
    apply(await window.api.update.check())
    if (
      noticeAllowed.value &&
      (state.value.status === 'available' || state.value.status === 'downloading')
    ) {
      showNotice.value = true
    }
  }

  /** 设置页手动检测：发现可处理的新版本后直接打开更新详情窗口 */
  async function checkAndOpenIfAvailable(): Promise<void> {
    await check()
    if (hasUpdate.value) {
      await openWindow()
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

  /** 用户主动发起一次性回退；失败后清空跳过记录，允许直接重试 */
  async function rollbackToStable(): Promise<void> {
    dismissedVersion.value = null
    apply(await window.api.update.rollbackToStable())
  }

  async function install(): Promise<boolean> {
    return window.api.update.install()
  }

  /** 打开更新详情窗口：先隐藏本窗口提示，避免窗口出现后提示仍停留 */
  async function openWindow(): Promise<void> {
    showNotice.value = false
    await window.api.update.openWindow()
  }

  /** 请求主进程协调全部编辑窗口保存后安装 */
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
    canRollback,
    rollbackInProgress,
    init,
    dispose,
    check,
    checkAndOpenIfAvailable,
    download,
    setBetaEnabled,
    rollbackToStable,
    install,
    openWindow,
    requestInstall,
    dismiss
  }
})
