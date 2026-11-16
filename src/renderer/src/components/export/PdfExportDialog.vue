<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { useDocumentsStore } from '../../stores/documents'
import { collapseExportDialog } from '../../composables/useExportDialogCollapse'
import { derivePdfFileName } from '../../utils/pdf-name'
import { useI18n } from '../../i18n'
import type { PdfExportOptions } from '../../types'

const props = defineProps<{ exporting: boolean }>()

const app = useAppStore()
const documents = useDocumentsStore()
const { t } = useI18n()

const emit = defineEmits<{
  close: []
  export: [options: PdfExportOptions]
}>()

const pageSize = ref<'A4' | 'Letter'>('A4')
const margin = ref<'narrow' | 'standard' | 'wide'>('standard')
const showPageNumbers = ref(true)
const showToc = ref(false)
const showFrontmatter = ref(true)
const overlayElement = ref<HTMLElement | null>(null)
const dialogElement = ref<HTMLElement | null>(null)
const collapsing = ref(false)
const busy = computed(() => props.exporting || collapsing.value)

watch(
  () => app.showPdfDialog,
  (visible) => {
    if (visible) collapsing.value = false
  }
)

async function handleExport(): Promise<void> {
  if (busy.value) return
  const doc = documents.activeDoc
  collapsing.value = true
  emit('export', {
    pageSize: pageSize.value,
    margin: margin.value,
    showPageNumbers: showPageNumbers.value,
    showToc: showToc.value,
    showFrontmatter: showFrontmatter.value,
    // 默认文件名取当前文档名且永不为空，避免保存对话框里重新输入
    fileName: derivePdfFileName(doc?.name),
    // 有磁盘路径时让对话框默认打开文档所在目录
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
      v-if="app.showPdfDialog"
      ref="overlayElement"
      class="dialog-overlay"
      @click.self="!busy && emit('close')"
    >
      <div ref="dialogElement" class="dialog" :class="app.resolvedTheme">
        <div class="dialog-header">
          <h3>{{ t('export.pdf.title') }}</h3>
          <button class="dialog-close" :disabled="busy" @click="emit('close')">
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
          <label class="field">
            <span>{{ t('export.pdf.pageSize') }}</span>
            <select v-model="pageSize">
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('export.pdf.margin') }}</span>
            <select v-model="margin">
              <option value="narrow">{{ t('export.pdf.marginNarrow') }}</option>
              <option value="standard">{{ t('export.pdf.marginStandard') }}</option>
              <option value="wide">{{ t('export.pdf.marginWide') }}</option>
            </select>
          </label>
          <label class="field checkbox-field">
            <input v-model="showPageNumbers" type="checkbox" />
            <span>{{ t('export.pdf.pageNumbers') }}</span>
          </label>
          <label class="field checkbox-field">
            <input v-model="showToc" type="checkbox" />
            <span>{{ t('export.pdf.toc') }}</span>
          </label>
          <label class="field checkbox-field">
            <input v-model="showFrontmatter" type="checkbox" />
            <span>{{ t('export.pdf.includeFrontmatter') }}</span>
          </label>
          <p class="export-hint">{{ t('export.pdf.hint') }}</p>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" :disabled="busy" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
          <button class="btn btn-primary" :disabled="busy" @click="handleExport">
            {{ busy ? t('common.exporting') : t('common.export') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: rgba(30, 30, 42, 0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  width: 380px;
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
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.dialog-close:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.field select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e0e0e4;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
}

.field select:focus {
  border-color: rgba(108, 155, 255, 0.4);
}

.checkbox-field {
  justify-content: flex-start;
  gap: 8px;
}

.checkbox-field input[type='checkbox'] {
  accent-color: #6c9bff;
}

.export-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.42);
}

.dialog.light .export-hint {
  color: rgba(0, 0, 0, 0.45);
}

.btn:disabled,
.dialog-close:disabled {
  opacity: 0.5;
  cursor: default;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn {
  padding: 7px 18px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.btn-primary {
  background: rgba(108, 155, 255, 0.2);
  color: #6c9bff;
}

.btn-primary:hover {
  background: rgba(108, 155, 255, 0.3);
}

.dialog.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.dialog.light .dialog-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.dialog.light .dialog-header h3 {
  color: #1a1a2e;
}

.dialog.light .dialog-close {
  color: rgba(0, 0, 0, 0.3);
}

.dialog.light .dialog-close:hover {
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.04);
}

.dialog.light .field {
  color: rgba(0, 0, 0, 0.6);
}

.dialog.light .field select {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1a1a2e;
}

.dialog.light .field select:focus {
  border-color: rgba(59, 130, 246, 0.4);
}

.dialog.light .dialog-footer {
  border-top-color: rgba(0, 0, 0, 0.06);
}

.dialog.light .btn-secondary {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.6);
}

.dialog.light .btn-secondary:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.8);
}

.dialog.light .btn-primary {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.dialog.light .btn-primary:hover {
  background: rgba(59, 130, 246, 0.2);
}
</style>
