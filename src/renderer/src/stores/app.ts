import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { LayoutMode, ThemeMode } from '../types'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadSavedTheme(): ThemeMode {
  const saved = localStorage.getItem('markit-theme')
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

export const useAppStore = defineStore('app', () => {
  const layoutMode = ref<LayoutMode>('edit-left')
  const themeMode = ref<ThemeMode>(loadSavedTheme())
  const systemIsDark = ref(getSystemTheme() === 'dark')
  const showOutline = ref(true)
  const splitRatio = ref(0.5)
  const fileName = ref('untitled.md')
  const filePath = ref<string | null>(null)
  const isModified = ref(false)
  const showPdfDialog = ref(false)

  const resolvedTheme = computed<'light' | 'dark'>(() =>
    themeMode.value === 'system' ? (systemIsDark.value ? 'dark' : 'light') : themeMode.value
  )

  const isSplitMode = computed(
    () => layoutMode.value === 'edit-left' || layoutMode.value === 'edit-right'
  )
  const showEditor = computed(() => layoutMode.value !== 'preview-only')
  const showPreview = computed(() => layoutMode.value !== 'edit-only')

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  function onSystemThemeChange(e: MediaQueryListEvent): void {
    systemIsDark.value = e.matches
  }
  mediaQuery.addEventListener('change', onSystemThemeChange)

  watch(themeMode, (mode) => {
    localStorage.setItem('markit-theme', mode)
  })

  function setLayoutMode(mode: LayoutMode) {
    layoutMode.value = mode
  }

  function cycleLayout() {
    const modes: LayoutMode[] = ['edit-left', 'edit-right', 'edit-only', 'preview-only']
    const idx = modes.indexOf(layoutMode.value)
    layoutMode.value = modes[(idx + 1) % modes.length]
  }

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
  }

  function cycleTheme(): void {
    const modes: ThemeMode[] = ['system', 'light', 'dark']
    const idx = modes.indexOf(themeMode.value)
    themeMode.value = modes[(idx + 1) % modes.length]
  }

  function toggleOutline() {
    showOutline.value = !showOutline.value
  }

  return {
    layoutMode,
    themeMode,
    resolvedTheme,
    showOutline,
    splitRatio,
    fileName,
    filePath,
    isModified,
    showPdfDialog,
    isSplitMode,
    showEditor,
    showPreview,
    setLayoutMode,
    cycleLayout,
    setThemeMode,
    cycleTheme,
    toggleOutline
  }
})
