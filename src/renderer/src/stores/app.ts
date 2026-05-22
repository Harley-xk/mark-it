import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LayoutMode, ThemeMode } from '../types'

export const useAppStore = defineStore('app', () => {
  const layoutMode = ref<LayoutMode>('edit-left')
  const themeMode = ref<ThemeMode>('dark')
  const showOutline = ref(true)
  const splitRatio = ref(0.5)
  const fileName = ref('untitled.md')
  const filePath = ref<string | null>(null)
  const isModified = ref(false)

  const isSplitMode = computed(() =>
    layoutMode.value === 'edit-left' || layoutMode.value === 'edit-right'
  )
  const showEditor = computed(() => layoutMode.value !== 'preview-only')
  const showPreview = computed(() => layoutMode.value !== 'edit-only')

  function setLayoutMode(mode: LayoutMode) {
    layoutMode.value = mode
  }

  function cycleLayout() {
    const modes: LayoutMode[] = ['edit-left', 'edit-right', 'edit-only', 'preview-only']
    const idx = modes.indexOf(layoutMode.value)
    layoutMode.value = modes[(idx + 1) % modes.length]
  }

  function toggleOutline() {
    showOutline.value = !showOutline.value
  }

  return {
    layoutMode, themeMode, showOutline, splitRatio,
    fileName, filePath, isModified,
    isSplitMode, showEditor, showPreview,
    setLayoutMode, cycleLayout, toggleOutline
  }
})
