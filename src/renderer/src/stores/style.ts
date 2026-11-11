import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { PreviewStyle } from '../types'

import githubCss from '../styles/preview/github.css?raw'
import academicCss from '../styles/preview/academic.css?raw'
import minimalCss from '../styles/preview/minimal.css?raw'

import githubLightCss from '../styles/preview/github-light.css?raw'
import academicLightCss from '../styles/preview/academic-light.css?raw'
import minimalLightCss from '../styles/preview/minimal-light.css?raw'

/** 预览样式选择与自定义 CSS 的持久化键 */
const STYLE_KEY = 'markit-preview-style'
const CUSTOM_STYLES_KEY = 'markit-custom-styles'

/** 单个自定义 CSS 的字符数上限，避免 localStorage 配额被大文件占满 */
export const MAX_CUSTOM_STYLE_CHARS = 200_000

const builtinStylesDark: PreviewStyle[] = [
  { id: 'github', name: 'GitHub', css: githubCss, isBuiltin: true },
  { id: 'academic', name: 'Academic', css: academicCss, isBuiltin: true },
  { id: 'minimal', name: 'Minimal', css: minimalCss, isBuiltin: true }
]

const builtinStylesLight: PreviewStyle[] = [
  { id: 'github', name: 'GitHub', css: githubLightCss, isBuiltin: true },
  { id: 'academic', name: 'Academic', css: academicLightCss, isBuiltin: true },
  { id: 'minimal', name: 'Minimal', css: minimalLightCss, isBuiltin: true }
]

/** 从 localStorage 恢复自定义样式；损坏或超限的条目直接丢弃 */
function loadCustomStyles(): PreviewStyle[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STYLES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const styles: PreviewStyle[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const style = item as Record<string, unknown>
      if (
        typeof style.id !== 'string' ||
        typeof style.name !== 'string' ||
        typeof style.css !== 'string'
      ) {
        continue
      }
      if (style.css.length > MAX_CUSTOM_STYLE_CHARS) continue
      styles.push({ id: style.id, name: style.name, css: style.css, isBuiltin: false })
    }
    return styles
  } catch (err) {
    console.warn('Failed to load custom preview styles:', err)
    return []
  }
}

function loadCurrentStyleId(): string {
  return localStorage.getItem(STYLE_KEY) || 'github'
}

export const useStyleStore = defineStore('style', () => {
  const customStyles = ref<PreviewStyle[]>(loadCustomStyles())
  const currentStyleId = ref(loadCurrentStyleId())
  // 上次选择的自定义样式可能已被删除：启动时归一为内置 GitHub
  if (
    ![...builtinStylesDark, ...customStyles.value].some(
      (style) => style.id === currentStyleId.value
    )
  ) {
    currentStyleId.value = 'github'
  }

  /** 设置窗口修改样式后，编辑窗口通过 storage 事件重新载入持久化结果 */
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && event.key !== STYLE_KEY && event.key !== CUSTOM_STYLES_KEY) return
    customStyles.value = loadCustomStyles()
    currentStyleId.value = loadCurrentStyleId()
    if (
      ![...builtinStylesDark, ...customStyles.value].some(
        (style) => style.id === currentStyleId.value
      )
    ) {
      currentStyleId.value = 'github'
    }
  })

  function builtinStyles(isDark: boolean): PreviewStyle[] {
    return isDark ? builtinStylesDark : builtinStylesLight
  }

  function allStyles(isDark: boolean): PreviewStyle[] {
    return [...builtinStyles(isDark), ...customStyles.value]
  }

  function currentStyle(isDark: boolean): PreviewStyle {
    return allStyles(isDark).find((s) => s.id === currentStyleId.value) || builtinStyles(isDark)[0]
  }

  function currentCss(isDark: boolean): string {
    return currentStyle(isDark).css
  }

  function setStyle(id: string): void {
    currentStyleId.value = id
  }

  function addCustomStyle(style: PreviewStyle): void {
    customStyles.value.push({ ...style, isBuiltin: false })
  }

  function removeCustomStyle(id: string): void {
    customStyles.value = customStyles.value.filter((s) => s.id !== id)
    if (currentStyleId.value === id) {
      currentStyleId.value = 'github'
    }
  }

  // 选择与自定义列表都持久化，重启后保持（写入失败不影响当前会话）
  watch(currentStyleId, (id) => {
    try {
      localStorage.setItem(STYLE_KEY, id)
    } catch (err) {
      console.warn('Failed to persist preview style:', err)
    }
  })

  watch(
    customStyles,
    (styles) => {
      try {
        localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(styles))
      } catch (err) {
        console.warn('Failed to persist custom preview styles:', err)
      }
    },
    { deep: true }
  )

  return {
    customStyles,
    currentStyleId,
    builtinStyles,
    allStyles,
    currentStyle,
    currentCss,
    setStyle,
    addCustomStyle,
    removeCustomStyle
  }
})
