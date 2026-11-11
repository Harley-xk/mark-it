import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ExportKind, ExportStatus, LayoutMode, PreviewWidthMode, ThemeMode } from '../types'
import { LAYOUT_MODES, loadSavedLayoutMode, saveLayoutMode } from '../utils/layout-mode'
import { useDocumentsStore } from './documents'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadSavedTheme(): ThemeMode {
  const saved = localStorage.getItem('markit-theme')
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
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

const APP_STORAGE_KEYS = new Set([
  'markit-theme',
  'markit-show-outline',
  'markit-outline-width',
  'markit-split-ratio',
  'markit-preview-width-mode',
  'markit-preview-width'
])

const EXPORT_STATUS_VISIBLE_MS = 3000

export const useAppStore = defineStore('app', () => {
  const documents = useDocumentsStore()
  // 布局按标签保存；没有激活标签的瞬间（关闭最后一个标签到窗口关闭之间）用兜底值
  const fallbackLayoutMode = ref<LayoutMode>(loadSavedLayoutMode())
  const layoutMode = computed<LayoutMode>(
    () => documents.activeDoc?.layoutMode ?? fallbackLayoutMode.value
  )
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
  /** PDF / 长图共用的导出任务状态，状态栏据此展示当前类型与进度 */
  const exportStatus = ref<ExportStatus>('idle')
  const exportKind = ref<ExportKind | null>(null)
  let exportStatusTimer: ReturnType<typeof setTimeout> | null = null
  /** 会话写盘失败（只读目录 / 磁盘已满等），状态栏据此给出可见提示 */
  const sessionSaveFailed = ref(false)
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

  /** 每个应用窗口各自持有 store；通过 storage 事件同步全局偏好 */
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && !APP_STORAGE_KEYS.has(event.key)) return
    themeMode.value = loadSavedTheme()
    showOutline.value = localStorage.getItem('markit-show-outline') !== '0'
    outlineWidth.value = loadClampedNumber('markit-outline-width', 220, 160, 500)
    splitRatio.value = loadClampedNumber('markit-split-ratio', 0.5, 0.3, 0.7)
    previewWidthMode.value = loadSavedPreviewWidthMode()
    previewWidth.value = loadClampedNumber('markit-preview-width', 800, 400, 1600)
  })

  watch(themeMode, (mode) => {
    localStorage.setItem('markit-theme', mode)
  })
  // markit-layout 记录最近一次使用的布局，作为新标签与旧会话的兜底
  watch(layoutMode, saveLayoutMode)
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

  function setLayoutMode(mode: LayoutMode): void {
    fallbackLayoutMode.value = mode
    if (documents.activeDoc) documents.setLayoutMode(documents.activeDoc.id, mode)
  }

  function cycleLayout(): void {
    const idx = LAYOUT_MODES.indexOf(layoutMode.value)
    setLayoutMode(LAYOUT_MODES[(idx + 1) % LAYOUT_MODES.length])
  }

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
  }

  function cycleTheme(): void {
    const modes: ThemeMode[] = ['system', 'light', 'dark']
    const idx = modes.indexOf(themeMode.value)
    themeMode.value = modes[(idx + 1) % modes.length]
  }

  function toggleOutline(): void {
    showOutline.value = !showOutline.value
  }

  function setSessionSaveFailed(failed: boolean): void {
    sessionSaveFailed.value = failed
  }

  function setExportStatus(kind: ExportKind, status: ExportStatus): void {
    if (exportStatusTimer) {
      clearTimeout(exportStatusTimer)
      exportStatusTimer = null
    }
    exportKind.value = kind
    exportStatus.value = status
    if (status === 'success' || status === 'error') {
      exportStatusTimer = setTimeout(() => {
        exportStatusTimer = null
        exportStatus.value = 'idle'
        exportKind.value = null
      }, EXPORT_STATUS_VISIBLE_MS)
    }
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
    exportStatus,
    exportKind,
    sessionSaveFailed,
    zoomFactor,
    zoomPercent,
    isSplitMode,
    showEditor,
    showPreview,
    setLayoutMode,
    cycleLayout,
    setThemeMode,
    cycleTheme,
    toggleOutline,
    setSessionSaveFailed,
    setExportStatus
  }
})
