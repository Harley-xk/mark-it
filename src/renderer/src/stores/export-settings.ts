/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 图片导出设置的 Pinia 状态、localStorage 读写与跨窗口同步
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ImageExportSettings } from '../../../shared/image-types'
import {
  DEFAULT_IMAGE_EXPORT_SETTINGS,
  IMAGE_EXPORT_SETTINGS_KEY,
  normalizeImageExportSettings
} from '../utils/image-export-settings'

function readSavedImageExportSettings(): ImageExportSettings {
  try {
    const raw = localStorage.getItem(IMAGE_EXPORT_SETTINGS_KEY)
    return raw
      ? normalizeImageExportSettings(JSON.parse(raw))
      : { ...DEFAULT_IMAGE_EXPORT_SETTINGS }
  } catch (err) {
    console.warn('Failed to load image export settings:', err)
    return { ...DEFAULT_IMAGE_EXPORT_SETTINGS }
  }
}

export const useExportSettingsStore = defineStore('export-settings', () => {
  const image = ref<ImageExportSettings>(readSavedImageExportSettings())

  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && event.key !== IMAGE_EXPORT_SETTINGS_KEY) return
    image.value = readSavedImageExportSettings()
  })

  function saveImage(settings: ImageExportSettings): void {
    const next = normalizeImageExportSettings(settings)
    image.value = next
    try {
      localStorage.setItem(IMAGE_EXPORT_SETTINGS_KEY, JSON.stringify(next))
    } catch (err) {
      console.warn('Failed to persist image export settings:', err)
    }
  }

  function resetImage(): void {
    image.value = { ...DEFAULT_IMAGE_EXPORT_SETTINGS }
  }

  return { image, saveImage, resetImage }
})
