import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UpdateState } from '../../../shared/update-types'

export const useUpdateStore = defineStore('update', () => {
  const state = ref<UpdateState>({
    status: 'idle',
    currentVersion: '',
    forceUpdate: false
  })
  /** 是否展示更新提示卡片（设置页始终展示状态，不依赖此值） */
  const showNotice = ref(false)
  /** 用户选择「稍后」的版本，同一版本不再自动弹出（进度事件会持续刷新状态） */
  const dismissedVersion = ref<string | null>(null)
  let initialized = false

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
    window.api.update.onState(apply)
    window.api.update.getState().then(apply)
  }

  async function check(): Promise<void> {
    // 手动检测：清除「稍后」记录，有更新时重新提示
    dismissedVersion.value = null
    apply(await window.api.update.check())
    if (state.value.status === 'available' || state.value.status === 'downloading') {
      showNotice.value = true
    }
  }

  async function download(): Promise<void> {
    apply(await window.api.update.download())
  }

  async function install(): Promise<boolean> {
    return window.api.update.install()
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
    check,
    download,
    install,
    dismiss
  }
})
