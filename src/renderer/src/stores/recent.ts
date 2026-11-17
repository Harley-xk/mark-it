/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 最近打开文件列表的前端缓存、跨窗口刷新与欢迎态浮层状态
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RecentFileEntry } from '../../../shared/recent-types'

export const useRecentStore = defineStore('recent', () => {
  const entries = ref<RecentFileEntry[]>([])
  const loaded = ref(false)
  /** 欢迎态浮层是否已在本次窗口会话内被手动关闭 */
  const welcomeDismissed = ref(false)
  let offChanged: (() => void) | null = null

  async function load(): Promise<void> {
    try {
      entries.value = await window.api.recent.list()
    } catch (err) {
      console.error('Failed to load recent files:', err)
      entries.value = []
    } finally {
      loaded.value = true
    }
  }

  /** 编辑窗口挂载时调用一次；重复调用不会重复注册广播监听 */
  function init(): void {
    if (offChanged) return
    offChanged = window.api.recent.onChanged(() => {
      void load()
    })
    void load()
  }

  function dispose(): void {
    offChanged?.()
    offChanged = null
  }

  async function clear(): Promise<void> {
    try {
      const ok = await window.api.recent.clear()
      if (ok) entries.value = []
    } catch (err) {
      console.error('Failed to clear recent files:', err)
    }
  }

  function dismissWelcome(): void {
    welcomeDismissed.value = true
  }

  return { entries, loaded, welcomeDismissed, init, dispose, load, clear, dismissWelcome }
})
