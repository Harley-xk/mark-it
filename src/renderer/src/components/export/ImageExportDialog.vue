<!--
  作者: Harley-xk
  创建: 2026-11-11
  描述: 长图导出设置对话框，收集格式、宽度、倍率、主题与文档信息选项
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ImageExportOptions, ImageExportSettings } from '../../types'
import { collapseExportDialog } from '../../composables/useExportDialogCollapse'
import { useAppStore } from '../../stores/app'
import { useDocumentsStore } from '../../stores/documents'
import { useExportSettingsStore } from '../../stores/export-settings'
import {
  DEFAULT_IMAGE_EXPORT_SETTINGS,
  IMAGE_CONTENT_WIDTHS,
  normalizeImageExportSettings
} from '../../utils/image-export-settings'
import { deriveImageFileName } from '../../utils/pdf-name'
import { useI18n } from '../../i18n'

const props = defineProps<{ exporting: boolean }>()

const app = useAppStore()
const documents = useDocumentsStore()
const exportSettings = useExportSettingsStore()
const { t } = useI18n()
const draft = ref<ImageExportSettings>({ ...DEFAULT_IMAGE_EXPORT_SETTINGS })
const overlayElement = ref<HTMLElement | null>(null)
const dialogElement = ref<HTMLElement | null>(null)
const collapsing = ref(false)
const busy = computed(() => props.exporting || collapsing.value)

const emit = defineEmits<{
  close: []
  export: [options: ImageExportOptions]
}>()

watch(
  () => app.showImageExportDialog,
  (visible) => {
    if (visible) {
      draft.value = { ...exportSettings.image }
      collapsing.value = false
    }
  }
)

const estimatedCanvasWidth = computed(() => draft.value.contentWidth + 80)
const estimatedOutputWidth = computed(() => estimatedCanvasWidth.value * draft.value.scale)
const formatLabel = computed(() => (draft.value.format === 'jpeg' ? 'JPEG' : 'PNG'))

function resetDefaults(): void {
  draft.value = { ...DEFAULT_IMAGE_EXPORT_SETTINGS }
}

async function handleExport(): Promise<void> {
  if (busy.value) return

  const settings = normalizeImageExportSettings(draft.value)
  exportSettings.saveImage(settings)
  const doc = documents.activeDoc
  collapsing.value = true
  emit('export', {
    ...settings,
    fileName: deriveImageFileName(doc?.name, settings.format),
    sourcePath: doc?.path ?? null
  })
  await nextTick()
  try {
    if (overlayElement.value && dialogElement.value) {
      await collapseExportDialog(dialogElement.value, overlayElement.value)
    }
  } finally {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="app.showImageExportDialog"
      ref="overlayElement"
      class="image-export-dialog-overlay"
      @click.self="!busy && emit('close')"
    >
      <div
        ref="dialogElement"
        class="image-export-dialog"
        :class="app.resolvedTheme"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-export-dialog-title"
      >
        <div class="dialog-header">
          <h3 id="image-export-dialog-title">{{ t('export.image.title') }}</h3>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('export.image.closeSettings')"
            :disabled="busy"
            @click="emit('close')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <div class="field-group">
            <span class="field-label">{{ t('export.image.format') }}</span>
            <div class="segment-group" :aria-label="t('export.image.format')">
              <button
                v-for="format in ['png', 'jpeg'] as const"
                :key="format"
                type="button"
                class="segment-button format-option"
                :class="{ active: draft.format === format }"
                :aria-pressed="draft.format === format"
                @click="draft.format = format"
              >
                {{ format === 'jpeg' ? 'JPEG' : 'PNG' }}
              </button>
            </div>
            <p class="field-hint">
              {{
                draft.format === 'jpeg'
                  ? t('export.image.formatJpegHint')
                  : t('export.image.formatPngHint')
              }}
            </p>
          </div>

          <div class="field-group">
            <span class="field-label">{{ t('export.image.contentWidth') }}</span>
            <div class="width-grid" :aria-label="t('export.image.contentWidth')">
              <button
                v-for="width in IMAGE_CONTENT_WIDTHS"
                :key="width"
                type="button"
                class="width-button width-option"
                :class="{ active: draft.contentWidth === width }"
                :aria-pressed="draft.contentWidth === width"
                @click="draft.contentWidth = width"
              >
                <span>{{ width }} px</span>
                <small>{{ t('export.image.canvasWidth', { width: width + 80 }) }}</small>
              </button>
            </div>
          </div>

          <div class="field-row">
            <span class="field-label">{{ t('export.image.quality') }}</span>
            <div class="segment-group compact" :aria-label="t('export.image.quality')">
              <button
                v-for="scale in [1, 2] as const"
                :key="scale"
                type="button"
                class="segment-button scale-option"
                :class="{ active: draft.scale === scale }"
                :aria-pressed="draft.scale === scale"
                @click="draft.scale = scale"
              >
                {{ scale }}×
              </button>
            </div>
          </div>

          <label class="field-row">
            <span class="field-label">{{ t('export.image.theme') }}</span>
            <select v-model="draft.theme" class="theme-select">
              <option value="preview">{{ t('export.image.themePreview') }}</option>
              <option value="light">{{ t('export.image.themeLight') }}</option>
              <option value="dark">{{ t('export.image.themeDark') }}</option>
            </select>
          </label>

          <label class="checkbox-field">
            <input v-model="draft.includeFrontmatter" type="checkbox" />
            <span>{{ t('export.image.includeFrontmatter') }}</span>
          </label>

          <div class="export-summary">
            <div>
              <span>{{ t('export.image.summaryCanvas') }}</span>
              <strong>{{ estimatedCanvasWidth }} px</strong>
            </div>
            <div>
              <span>{{ t('export.image.summaryOutput', { format: formatLabel }) }}</span>
              <strong>{{ t('export.image.outputWidth', { width: estimatedOutputWidth }) }}</strong>
            </div>
          </div>
          <p class="export-hint">{{ t('export.image.hint') }}</p>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-reset" type="button" :disabled="busy" @click="resetDefaults">
            {{ t('common.resetDefaults') }}
          </button>
          <div class="footer-actions">
            <button class="btn btn-secondary" type="button" :disabled="busy" @click="emit('close')">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" type="button" :disabled="busy" @click="handleExport">
              {{ busy ? t('common.exporting') : t('common.export') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-export-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.image-export-dialog {
  width: 440px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  background: rgba(30, 30, 42, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dialog-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e4;
}

.dialog-close {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

.dialog-close:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.field-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.field-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.38);
}

.segment-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.segment-group.compact {
  grid-template-columns: repeat(2, 58px);
}

.segment-button,
.width-button {
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.58);
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.segment-button {
  height: 30px;
  font-size: 12px;
}

.segment-button:hover,
.width-button:hover {
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.05);
}

.segment-button.active,
.width-button.active {
  color: #9db8ff;
  background: rgba(108, 155, 255, 0.14);
  border-color: rgba(108, 155, 255, 0.28);
}

.width-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.width-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 9px 11px;
  text-align: left;
}

.width-button span {
  font-size: 12px;
}

.width-button small {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.36);
}

.width-button.active small {
  color: rgba(157, 184, 255, 0.7);
}

.theme-select {
  min-width: 140px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  outline: none;
  background: rgba(255, 255, 255, 0.06);
  color: #e0e0e4;
  font-family: inherit;
  font-size: 13px;
}

.theme-select:focus {
  border-color: rgba(108, 155, 255, 0.4);
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.68);
}

.checkbox-field input[type='checkbox'] {
  accent-color: #6c9bff;
}

.export-summary {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(108, 155, 255, 0.14);
  border-radius: 8px;
  background: rgba(108, 155, 255, 0.06);
}

.export-summary div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-summary span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.38);
}

.export-summary strong {
  font-size: 12px;
  font-weight: 500;
  color: #b9c9ef;
}

.export-hint {
  margin: -6px 0 0;
  font-size: 11px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.38);
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 16px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled,
.dialog-close:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-reset {
  padding-inline: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
}

.btn-reset:hover {
  color: rgba(255, 255, 255, 0.72);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.62);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.82);
}

.btn-primary {
  background: rgba(108, 155, 255, 0.2);
  color: #7fa7ff;
}

.btn-primary:hover {
  background: rgba(108, 155, 255, 0.3);
}

.image-export-dialog.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.image-export-dialog.light .dialog-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.image-export-dialog.light .dialog-header h3,
.image-export-dialog.light .theme-select {
  color: #1a1a2e;
}

.image-export-dialog.light .dialog-close {
  color: rgba(0, 0, 0, 0.3);
}

.image-export-dialog.light .dialog-close:hover {
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.04);
}

.image-export-dialog.light .field-label,
.image-export-dialog.light .checkbox-field {
  color: rgba(0, 0, 0, 0.62);
}

.image-export-dialog.light .field-hint,
.image-export-dialog.light .export-hint,
.image-export-dialog.light .export-summary span {
  color: rgba(0, 0, 0, 0.45);
}

.image-export-dialog.light .segment-group {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.03);
}

.image-export-dialog.light .segment-button,
.image-export-dialog.light .width-button {
  color: rgba(0, 0, 0, 0.55);
}

.image-export-dialog.light .segment-button:hover,
.image-export-dialog.light .width-button:hover {
  color: rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.04);
}

.image-export-dialog.light .segment-button.active,
.image-export-dialog.light .width-button.active {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.22);
}

.image-export-dialog.light .width-button small {
  color: rgba(0, 0, 0, 0.36);
}

.image-export-dialog.light .theme-select {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.04);
}

.image-export-dialog.light .export-summary {
  border-color: rgba(59, 130, 246, 0.14);
  background: rgba(59, 130, 246, 0.06);
}

.image-export-dialog.light .export-summary strong {
  color: #315ea8;
}

.image-export-dialog.light .dialog-footer {
  border-top-color: rgba(0, 0, 0, 0.06);
}

.image-export-dialog.light .btn-reset {
  color: rgba(0, 0, 0, 0.45);
}

.image-export-dialog.light .btn-secondary {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.62);
}

.image-export-dialog.light .btn-primary {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}
</style>
