<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import { useFile } from '../../composables/useFile'
import type { LayoutMode } from '../../types'

const app = useAppStore()
const file = useFile()

const layouts: { mode: LayoutMode; icon: string; tip: string }[] = [
  { mode: 'edit-left', icon: '◧', tip: '左编辑 右预览' },
  { mode: 'edit-right', icon: '◨', tip: '左预览 右编辑' },
  { mode: 'edit-only', icon: '▣', tip: '仅编辑' },
  { mode: 'preview-only', icon: '▢', tip: '仅预览' }
]
</script>

<template>
  <div class="toolbar">
    <!-- File -->
    <div class="toolbar-group">
      <button class="tb-btn" title="新建 (Ctrl+N)" @click="file.newFile()">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>
      <button class="tb-btn" title="打开 (Ctrl+O)" @click="file.openFile()">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <polyline points="9 14 12 11 15 14" />
        </svg>
      </button>
      <button class="tb-btn" title="保存 (Ctrl+S)" @click="file.saveFile()">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      </button>
      <button
        class="tb-btn"
        title="刷新 (F5 / Ctrl+R)"
        :disabled="!app.filePath"
        @click="file.refreshFile()"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Layout -->
    <div class="toolbar-group">
      <button
        v-for="l in layouts"
        :key="l.mode"
        class="tb-btn icon-btn"
        :class="{ active: app.layoutMode === l.mode }"
        :title="l.tip"
        @click="app.setLayoutMode(l.mode)"
      >
        {{ l.icon }}
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Toggle -->
    <div class="toolbar-group">
      <button
        class="tb-btn"
        :class="{ active: app.showOutline }"
        title="大纲 (Ctrl+Shift+O)"
        @click="app.toggleOutline()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <!-- Export & Settings -->
    <div class="toolbar-group">
      <button class="tb-btn export-btn" title="导出 PDF (Ctrl+P)" @click="app.showPdfDialog = true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </button>
      <button class="tb-btn" title="设置 (Ctrl+,)" @click="app.showSettingsDialog = true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.025);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  -webkit-app-region: no-drag;
  gap: 2px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-separator {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.07);
  margin: 0 6px;
  border-radius: 1px;
}

.toolbar-spacer {
  flex: 1;
}

.tb-btn {
  width: 32px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s ease;
  position: relative;
}

.tb-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.tb-btn.active {
  background: rgba(108, 155, 255, 0.12);
  color: #6c9bff;
}

.tb-btn.active:hover {
  background: rgba(108, 155, 255, 0.18);
}

.tb-btn:disabled {
  opacity: 0.3;
  cursor: default;
  pointer-events: none;
}

.icon-btn {
  font-size: 15px;
}

.export-btn {
  color: rgba(108, 155, 255, 0.6);
}

.export-btn:hover {
  color: #6c9bff;
  background: rgba(108, 155, 255, 0.08);
}

/* Light theme */
:global(.light) .toolbar {
  background: #ffffff;
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:global(.light) .tb-btn {
  color: rgba(0, 0, 0, 0.45);
}

:global(.light) .tb-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
}

:global(.light) .tb-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

:global(.light) .toolbar-separator {
  background: rgba(0, 0, 0, 0.08);
}
</style>
