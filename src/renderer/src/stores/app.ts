import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { LayoutMode, PreviewWidthMode, ThemeMode } from '../types'
import { useDocumentsStore } from './documents'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadSavedTheme(): ThemeMode {
  const saved = localStorage.getItem('markit-theme')
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

function loadSavedLayoutMode(): LayoutMode {
  const saved = localStorage.getItem('markit-layout')
  if (
    saved === 'edit-left' ||
    saved === 'edit-right' ||
    saved === 'edit-only' ||
    saved === 'preview-only'
  ) {
    return saved
  }
  return 'edit-left'
}

function loadSavedPreviewWidthMode(): PreviewWidthMode {
  return localStorage.getItem('markit-preview-width-mode') === 'auto' ? 'auto' : 'fixed'
}

function loadClampedNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = localStorage.getItem(key)
  const saved = raw === null ? NaN : Number(raw)
  const value = Number.isFinite(saved) ? saved : fallback
  return Math.min(max, Math.max(min, value))
}

export const useAppStore = defineStore('app', () => {
  const documents = useDocumentsStore()
  const layoutMode = ref<LayoutMode>(loadSavedLayoutMode())
  const themeMode = ref<ThemeMode>(loadSavedTheme())
  const systemIsDark = ref(getSystemTheme() === 'dark')
  const showOutline = ref(localStorage.getItem('markit-show-outline') !== '0')
  const outlineWidth = ref(loadClampedNumber('markit-outline-width', 220, 160, 500))
  const splitRatio = ref(loadClampedNumber('markit-split-ratio', 0.5, 0.3, 0.7))
  const previewWidthMode = ref<PreviewWidthMode>(loadSavedPreviewWidthMode())
  const previewWidth = ref(loadClampedNumber('markit-preview-width', 800, 400, 1600))
  // 文件相关状态取自当前激活的标签页
  const fileName = computed(() => documents.activeDoc?.name ?? 'untitled.md')
  const filePath = computed(() => documents.activeDoc?.path ?? null)
  const isModified = computed(() => documents.activeDoc?.isModified ?? false)
  const showPdfDialog = ref(false)
  const showSettingsDialog = ref(false)
  // 整窗缩放比例由主进程维护，这里仅用于状态栏展示
  const zoomFactor = ref(1)
  const zoomPercent = computed(() => Math.round(zoomFactor.value * 100))

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
  watch(layoutMode, (mode) => {
    localStorage.setItem('markit-layout', mode)
  })
  watch(showOutline, (v) => {
    localStorage.setItem('markit-show-outline', v ? '1' : '0')
  })
  watch(outlineWidth, (w) => {
    localStorage.setItem('markit-outline-width', String(w))
  })
  watch(splitRatio, (r) => {
    localStorage.setItem('markit-split-ratio', String(r))
  })
  watch(previewWidthMode, (m) => {
    localStorage.setItem('markit-preview-width-mode', m)
  })
  watch(previewWidth, (w) => {
    localStorage.setItem('markit-preview-width', String(w))
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
    outlineWidth,
    splitRatio,
    previewWidthMode,
    previewWidth,
    fileName,
    filePath,
    isModified,
    showPdfDialog,
    showSettingsDialog,
    zoomFactor,
    zoomPercent,
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
