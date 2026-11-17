<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useDocumentsStore } from '../../stores/documents'
import { confirmUnsaved } from '../../composables/useConfirmUnsaved'
import { useI18n } from '../../i18n'
import ZoomControl from './ZoomControl.vue'

const editor = useEditorStore()
const app = useAppStore()
const docs = useDocumentsStore()
const { t } = useI18n()

const encodingLabel = computed(() => {
  const doc = docs.activeDoc
  if (!doc?.path) return t('status.encoding.utf8')
  switch (doc.encoding) {
    case 'utf-8-bom':
      return t('status.encoding.utf8Bom')
    case 'utf-16le':
      return t('status.encoding.utf16leReadOnly')
    case 'utf-16be':
      return t('status.encoding.utf16beReadOnly')
    case 'unsupported':
      return t('status.encoding.unsupportedReadOnly')
    default:
      return doc.readOnly ? t('status.encoding.utf8ReadOnly') : t('status.encoding.utf8')
  }
})

const exportKindLabel = computed(() => {
  if (app.exportKind === 'image') return t('status.exportKind.image')
  if (app.exportKind === 'pdf') return t('status.exportKind.pdf')
  return t('status.exportKind.document')
})

const exportStatusText = computed(() => {
  const kind = exportKindLabel.value
  const detail = app.exportStatusDetail
    ? t('status.exportDetail', { detail: app.exportStatusDetail })
    : ''
  switch (app.exportStatus) {
    case 'success':
      return t('status.exportSuccess', { kind }) + detail
    case 'error':
      return t('status.exportFailure', { kind }) + detail
    default:
      return ''
  }
})

const layoutLabel = computed(() => {
  switch (app.layoutMode) {
    case 'edit-left':
      return t('status.layout.editLeft')
    case 'edit-right':
      return t('status.layout.editRight')
    case 'edit-only':
      return t('status.layout.editOnly')
    default:
      return t('status.layout.previewOnly')
  }
})

const modeLabel = computed(() => {
  const doc = docs.activeDoc
  if (!doc || doc.mode === 'normal') return ''
  return doc.mode === 'plain' ? t('status.mode.plain') : t('status.mode.large')
})

const modeTitle = computed(() => {
  const doc = docs.activeDoc
  return doc?.mode === 'plain' ? t('status.mode.plainTitle') : t('status.mode.largeTitle')
})

const wordsLabel = computed(() =>
  docs.activeDoc?.mode === 'plain'
    ? t('status.wordsDisabled')
    : t('status.words', { count: editor.wordCount })
)

/** 纯文本模式恢复 Markdown 能力；恢复前提示可能卡顿 */
async function restoreMarkdownMode(): Promise<void> {
  const doc = docs.activeDoc
  if (!doc || doc.mode !== 'plain') return
  const action = await confirmUnsaved(
    t('file.mode.restoreMarkdownTitle'),
    t('file.mode.restoreMarkdownMessage', { name: doc.name }),
    { save: t('file.mode.restoreMarkdownAction') },
    true,
    { hideDiscard: true, cancelText: t('common.cancel') }
  )
  if (action === 'save') docs.restoreMarkdownMode(doc.id)
}

const exportAriaLabel = computed(() => {
  if (app.exportStatus === 'exporting') {
    const stage = app.exportProgressStage || t('status.exportPreparing')
    return t('status.exportProgressAria', {
      kind: exportKindLabel.value,
      stage,
      percent: app.exportProgressPercent
    })
  }
  return exportStatusText.value
})
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ app.fileName }}</span>
      <template v-if="app.showEditor">
        <span class="status-sep">|</span>
        <span class="status-item">{{
          t('status.lineCol', { line: editor.cursorLine, column: editor.cursorCol })
        }}</span>
      </template>
    </div>
    <div class="status-right">
      <div
        class="status-export-anchor"
        :class="[`is-${app.exportStatus}`, { 'is-active': app.exportStatus !== 'idle' }]"
        data-export-status-anchor
        :role="app.exportStatus === 'exporting' ? 'progressbar' : 'status'"
        :aria-valuemin="app.exportStatus === 'exporting' ? 0 : undefined"
        :aria-valuemax="app.exportStatus === 'exporting' ? 100 : undefined"
        :aria-valuenow="app.exportStatus === 'exporting' ? app.exportProgressPercent : undefined"
        :aria-label="exportAriaLabel"
        :title="
          app.exportStatus === 'error'
            ? t('status.exportFailureConsole', { kind: exportKindLabel })
            : app.exportStatus === 'exporting'
              ? `${app.exportProgressStage} · ${app.exportProgressPercent}%`
              : app.exportStatusDetail || undefined
        "
        aria-live="polite"
        aria-atomic="true"
      >
        <div v-if="app.exportStatus === 'exporting'" class="status-export-running">
          <span class="status-spinner" aria-hidden="true"></span>
          <span class="status-export-type">{{
            t('status.exportRunning', { kind: exportKindLabel })
          }}</span>
          <span class="status-export-stage">{{
            app.exportProgressStage || t('status.exportPreparing')
          }}</span>
          <span class="status-export-percent">{{ app.exportProgressPercent }}%</span>
        </div>
        <div v-else-if="app.exportStatus !== 'idle'" class="status-export-result">
          <span class="status-export-result-icon" aria-hidden="true">
            {{ app.exportStatus === 'success' ? '✓' : '!' }}
          </span>
          <span class="status-export-result-text">{{ exportStatusText }}</span>
        </div>
        <span
          v-if="app.exportStatus === 'exporting'"
          class="status-export-track"
          aria-hidden="true"
        >
          <span
            class="status-export-fill"
            :style="{ width: `${app.exportProgressPercent}%` }"
          ></span>
        </span>
      </div>
      <template v-if="app.exportStatus !== 'idle'">
        <span class="status-sep">|</span>
      </template>
      <template v-if="app.sessionSaveFailed">
        <span class="status-item status-warning" :title="t('status.sessionSaveFailedTitle')">
          {{ t('status.sessionSaveFailed') }}
        </span>
        <span class="status-sep">|</span>
      </template>
      <template v-if="modeLabel">
        <span class="status-item status-mode" :title="modeTitle">{{ modeLabel }}</span>
        <template v-if="docs.activeDoc?.mode === 'plain'">
          <button
            type="button"
            class="status-mode-action"
            :title="t('status.mode.restoreTitle')"
            @click="restoreMarkdownMode"
          >
            {{ t('status.mode.restore') }}
          </button>
        </template>
        <span class="status-sep">|</span>
      </template>
      <span class="status-item">{{ wordsLabel }}</span>
      <span class="status-sep">|</span>
      <span class="status-item" :title="app.filePath || undefined">{{ encodingLabel }}</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ layoutLabel }}</span>
      <template v-if="app.zoomPercent !== 100">
        <span class="status-sep">|</span>
        <ZoomControl />
      </template>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  user-select: none;
}

.status-left,
.status-right {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-sep {
  color: rgba(255, 255, 255, 0.1);
}

.status-warning {
  color: #e0a04a;
}

.status-mode {
  color: #e0a04a;
}

.status-mode-action {
  height: 18px;
  padding: 0 6px;
  border: 1px solid rgba(224, 160, 74, 0.4);
  border-radius: 4px;
  background: rgba(224, 160, 74, 0.1);
  color: #e0a04a;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.status-mode-action:hover {
  background: rgba(224, 160, 74, 0.2);
  border-color: rgba(224, 160, 74, 0.65);
}

.status-export-anchor {
  --export-accent: #7fa7ff;
  --export-accent-bright: #b9cfff;
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 clamp(176px, 22vw, 204px);
  height: 20px;
  padding: 0 8px 2px;
  overflow: hidden;
  border-radius: 4px;
  color: var(--export-accent);
  transition: background 0.18s ease;
}

.status-export-anchor.is-active {
  background: rgba(108, 155, 255, 0.08);
}

.status-export-anchor.is-success {
  --export-accent: #4ade80;
  --export-accent-bright: #a7f3c5;
  background: rgba(74, 222, 128, 0.08);
}

.status-export-anchor.is-error {
  --export-accent: #e0a04a;
  --export-accent-bright: #f4ca88;
  background: rgba(224, 160, 74, 0.08);
}

.status-export-running,
.status-export-result {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 6px;
}

.status-export-type {
  flex-shrink: 0;
  color: var(--export-accent-bright);
  font-weight: 500;
}

.status-export-stage,
.status-export-result-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-export-stage {
  color: var(--export-accent);
  opacity: 0.72;
}

.status-export-percent {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--export-accent-bright);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-export-result-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.status-export-track {
  position: absolute;
  right: 7px;
  bottom: 1px;
  left: 7px;
  height: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.09);
}

.status-export-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--export-accent) 0%,
    var(--export-accent-bright) 42%,
    var(--export-accent) 76%,
    var(--export-accent-bright) 100%
  );
  background-size: 200% 100%;
  animation: status-progress-flow 1.25s linear infinite;
  transition: width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.status-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: status-spin 0.8s linear infinite;
}

@keyframes status-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes status-progress-flow {
  to {
    background-position: -200% 0;
  }
}

:global(.light .status-export-anchor) {
  --export-accent: #2563eb;
  --export-accent-bright: #1d4ed8;
}

:global(.light .status-export-anchor.is-active) {
  background: rgba(37, 99, 235, 0.07);
}

:global(.light .status-export-anchor.is-success) {
  --export-accent: #15803d;
  --export-accent-bright: #166534;
  background: rgba(21, 128, 61, 0.08);
}

:global(.light .status-export-anchor.is-error) {
  --export-accent: #b45309;
  --export-accent-bright: #92400e;
  background: rgba(180, 83, 9, 0.08);
}

:global(.light .status-export-track) {
  background: rgba(0, 0, 0, 0.08);
}

:global(.light .status-bar) {
  background: #ffffff;
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}

:global(.light .status-sep) {
  color: rgba(0, 0, 0, 0.1);
}

:global(.light .status-warning),
:global(.light .status-mode) {
  color: #b45309;
}

:global(.light .status-mode-action) {
  border-color: rgba(180, 83, 9, 0.35);
  background: rgba(180, 83, 9, 0.06);
  color: #b45309;
}

:global(.light .status-mode-action:hover) {
  background: rgba(180, 83, 9, 0.12);
  border-color: rgba(180, 83, 9, 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .status-spinner,
  .status-export-fill {
    animation: none;
  }

  .status-export-fill {
    transition: none;
  }
}
</style>
