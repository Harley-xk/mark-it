/*
 * 作者: Harley-xk
 * 创建: 2026-11-09
 *
 * 描述: 搜索与替换的全局状态：面板开关、查询、匹配计数、循环导航与 HUD
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAppStore } from './app'

export type SearchSurface = 'editor' | 'preview'

const CASE_SENSITIVE_KEY = 'markit-search-case-sensitive'
const HUD_DURATION = 1600

export const useSearchStore = defineStore('search', () => {
  const app = useAppStore()

  const isOpen = ref(false)
  const query = ref('')
  const replaceText = ref('')
  const showReplace = ref(false)
  const caseSensitive = ref(localStorage.getItem(CASE_SENSITIVE_KEY) === '1')
  const total = ref(0)
  const index = ref(-1)
  /** 每次打开递增，面板据此把焦点收回查询框 */
  const focusToken = ref(0)
  /** 每次用户主动导航递增，组件据此区分「用户导航」与「内容变化」 */
  const navToken = ref(0)
  const hudMessage = ref('')
  const hudVisible = ref(false)

  let hudTimer: ReturnType<typeof setTimeout> | null = null

  /** 能编辑时始终以源文本为准；仅预览时才退化为渲染文本搜索 */
  const surface = computed<SearchSurface>(() => (app.showEditor ? 'editor' : 'preview'))

  watch(caseSensitive, (value) => {
    localStorage.setItem(CASE_SENSITIVE_KEY, value ? '1' : '0')
  })

  function showHud(message: string): void {
    hudMessage.value = message
    hudVisible.value = true
    if (hudTimer) clearTimeout(hudTimer)
    hudTimer = setTimeout(() => {
      hudVisible.value = false
      hudTimer = null
    }, HUD_DURATION)
  }

  function open(withReplace = false): void {
    isOpen.value = true
    if (withReplace && surface.value === 'editor') showReplace.value = true
    focusToken.value += 1
  }

  function close(): void {
    isOpen.value = false
    total.value = 0
    index.value = -1
    hudVisible.value = false
    if (hudTimer) {
      clearTimeout(hudTimer)
      hudTimer = null
    }
  }

  /**
   * 搜索结果变化：reset 为 true 时回到第一项；
   * 否则只把当前项夹取到有效范围，保留用户所在位置。
   */
  function updateResult(count: number, reset: boolean): void {
    total.value = count
    if (count === 0) {
      index.value = -1
      return
    }
    if (reset || index.value < 0 || index.value >= count) index.value = 0
  }

  function next(): void {
    if (total.value <= 0) {
      showHud('没有匹配项')
      return
    }
    if (index.value + 1 >= total.value) {
      index.value = 0
      showHud('已到达末尾，已循环到开头')
    } else {
      index.value += 1
    }
    navToken.value += 1
  }

  function previous(): void {
    if (total.value <= 0) {
      showHud('没有匹配项')
      return
    }
    if (index.value <= 0) {
      index.value = total.value - 1
      showHud('已到达开头，已循环到末尾')
    } else {
      index.value -= 1
    }
    navToken.value += 1
  }

  /** 替换后定位到指定匹配项，并让编辑器 / 预览区跟随滚动 */
  function jumpTo(value: number): void {
    if (total.value <= 0) {
      index.value = -1
      return
    }
    index.value = Math.min(Math.max(value, 0), total.value - 1)
    navToken.value += 1
  }

  function toggleCaseSensitive(): void {
    caseSensitive.value = !caseSensitive.value
  }

  function toggleReplace(): void {
    if (surface.value !== 'editor') return
    showReplace.value = !showReplace.value
  }

  return {
    isOpen,
    query,
    replaceText,
    showReplace,
    caseSensitive,
    total,
    index,
    focusToken,
    navToken,
    hudMessage,
    hudVisible,
    surface,
    open,
    close,
    updateResult,
    next,
    previous,
    jumpTo,
    toggleCaseSensitive,
    toggleReplace,
    showHud
  }
})
