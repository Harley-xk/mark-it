<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/app'
import { useEditorStore } from '../../stores/editor'
import { applyFormatAction, formatActions } from '../../composables/useFormatActions'
import { useFile } from '../../composables/useFile'
import type { LayoutMode } from '../../types'

const app = useAppStore()
const editor = useEditorStore()
const file = useFile()

const layouts: { mode: LayoutMode; icon: string; tip: string }[] = [
  { mode: 'edit-left', icon: '◧', tip: '左编辑 右预览' },
  { mode: 'edit-right', icon: '◨', tip: '左预览 右编辑' },
  { mode: 'edit-only', icon: '▣', tip: '仅编辑' },
  { mode: 'preview-only', icon: '▢', tip: '仅预览' }
]

const themeTip = computed(() => {
  const labels: Record<string, string> = {
    system: '跟随系统',
    light: '浅色模式',
    dark: '深色模式'
  }
  const next: Record<string, string> = {
    system: '浅色',
    light: '深色',
    dark: '跟随系统'
  }
  return `${labels[app.themeMode]}（点击切换为${next[app.themeMode]}）`
})

function fmt(action: string) {
  const a = formatActions[action]
  if (a) applyFormatAction(editor.editorView, a)
}
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

    <!-- Format -->
    <div class="toolbar-group">
      <button class="tb-btn" title="加粗 (Ctrl+B)" @click="fmt('bold')">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </button>
      <button class="tb-btn" title="斜体 (Ctrl+I)" @click="fmt('italic')">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" y1="4" x2="10" y2="4" />
          <line x1="14" y1="20" x2="5" y2="20" />
          <line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </button>
      <button class="tb-btn" title="删除线" @click="fmt('strikethrough')">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="4" y1="12" x2="20" y2="12" />
          <path
            d="M17.5 7.5c0-2-1.5-3.5-5.5-3.5S6 5 6 7.5c0 4 12 3 12 7.5 0 2.5-2.5 4-6 4s-6-1.5-6-4"
          />
        </svg>
      </button>
      <button class="tb-btn" title="标题" @click="fmt('h2')">
        <span class="tb-text">H</span>
      </button>
      <button class="tb-btn" title="引用" @click="fmt('quote')">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"
          />
          <path
            d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"
          />
        </svg>
      </button>
      <button class="tb-btn" title="链接 (Ctrl+K)" @click="fmt('link')">
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
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>
      <button class="tb-btn" title="图片" @click="fmt('image')">
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>
      <button class="tb-btn" title="代码块 (Ctrl+Shift+K)" @click="fmt('codeblock')">
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
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
      <button class="tb-btn" title="无序列表" @click="fmt('ul')">
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
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </button>
      <button class="tb-btn" title="任务列表" @click="fmt('task')">
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
          <rect x="3" y="5" width="6" height="6" rx="1" />
          <path d="m3 17 2 2 4-4" />
          <line x1="13" y1="8" x2="21" y2="8" />
          <line x1="13" y1="16" x2="21" y2="16" />
        </svg>
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
      <button class="tb-btn theme-btn" :title="themeTip" @click="app.cycleTheme()">
        <svg
          v-if="app.themeMode === 'light'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <svg
          v-else-if="app.themeMode === 'dark'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <!-- Export -->
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

.icon-btn {
  font-size: 15px;
}

.tb-text {
  font-weight: 700;
  font-size: 13px;
}

.export-btn {
  color: rgba(108, 155, 255, 0.6);
}

.export-btn:hover {
  color: #6c9bff;
  background: rgba(108, 155, 255, 0.08);
}

.theme-btn {
  color: rgba(255, 255, 255, 0.45);
}

.theme-btn:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
}

:global(.light) .theme-btn {
  color: rgba(0, 0, 0, 0.45);
}

:global(.light) .theme-btn:hover {
  color: rgba(0, 0, 0, 0.75);
  background: rgba(0, 0, 0, 0.04);
}

/* Light theme */
:global(.light) .toolbar {
  background: rgba(0, 0, 0, 0.02);
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
