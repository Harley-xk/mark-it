<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import type { LayoutMode } from '../../types'

const app = useAppStore()

const layouts: { mode: LayoutMode; icon: string; tip: string }[] = [
  { mode: 'edit-left', icon: '⬛⬜', tip: '左编辑 右预览' },
  { mode: 'edit-right', icon: '⬜⬛', tip: '左预览 右编辑' },
  { mode: 'edit-only', icon: '⬛', tip: '仅编辑' },
  { mode: 'preview-only', icon: '⬜', tip: '仅预览' }
]
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button class="tb-btn" title="新建 (Ctrl+N)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3.4 3.5.1.4v10c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V2c0-.6.4-1 1-1h5.1l.4.1zM9 2H4v13h8V5.5L9 2z"/></svg>
      </button>
      <button class="tb-btn" title="打开 (Ctrl+O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 14h12l1.5-6H13V4.5c0-.3-.2-.5-.5-.5H7L5.5 2.5h-4c-.3 0-.5.2-.5.5v10c0 .3.2.5.5.5V14zm.5-1V4h3.5L7 5.5h5V8H4L2 13z"/></svg>
      </button>
      <button class="tb-btn" title="保存 (Ctrl+S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.35 1.35l1.29 1.3c.2.2.36.5.36.85v11c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5v-13c0-.28.22-.5.5-.5h11c.35 0 .65.16.85.35zM12 2H4v3h8V2zm1 0v4H3V2H1.5v12h13V3.5L13 2zm-3 7v4H6V9h4z"/></svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button
        v-for="l in layouts" :key="l.mode"
        class="tb-btn"
        :class="{ active: app.layoutMode === l.mode }"
        :title="l.tip"
        @click="app.setLayoutMode(l.mode)"
      >{{ l.icon }}</button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="tb-btn" title="加粗 (Ctrl+B)"><b>B</b></button>
      <button class="tb-btn" title="斜体 (Ctrl+I)"><i>I</i></button>
      <button class="tb-btn" title="删除线"><s>S</s></button>
      <button class="tb-btn" title="标题">H</button>
      <button class="tb-btn" title="链接 (Ctrl+K)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.35 9.65a3 3 0 004.24 0l2.12-2.12a3 3 0 00-4.24-4.24l-.71.71.71.71.71-.71a1.8 1.8 0 012.54 2.54l-2.12 2.12a1.8 1.8 0 01-2.54 0l-.71.71.71-.71-.71-.71z"/><path d="M9.65 6.35a3 3 0 00-4.24 0L3.29 8.47a3 3 0 004.24 4.24l.71-.71-.71-.71-.71.71a1.8 1.8 0 01-2.54-2.54l2.12-2.12a1.8 1.8 0 012.54 0l.71-.71z"/></svg>
      </button>
      <button class="tb-btn" title="代码块 (Ctrl+Shift+K)">&lt;/&gt;</button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button
        class="tb-btn"
        :class="{ active: app.showOutline }"
        title="大纲 (Ctrl+Shift+O)"
        @click="app.toggleOutline()"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v1H1V3zm0 3h10v1H1V6zm0 3h12v1H1V9zm0 3h8v1H1v-1z"/></svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <button class="tb-btn" title="导出 PDF (Ctrl+P)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V5.5L9.5 1H4zm0 1h5v3.5H13V13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm5.5.5L12.5 5H9.5V2.5z"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.08);
  margin: 0 6px;
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
  color: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s ease;
}

.tb-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.tb-btn.active {
  background: rgba(108, 155, 255, 0.15);
  color: #6c9bff;
}

.light .toolbar {
  background: rgba(0, 0, 0, 0.02);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.light .tb-btn {
  color: rgba(0, 0, 0, 0.5);
}

.light .tb-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

.light .toolbar-separator {
  background: rgba(0, 0, 0, 0.08);
}

.light .tb-btn.active {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}
</style>
