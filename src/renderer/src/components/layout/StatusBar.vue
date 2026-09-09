<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'

const editor = useEditorStore()
const app = useAppStore()
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ app.fileName }}</span>
      <span class="status-sep">|</span>
      <span class="status-item">行 {{ editor.cursorLine }}, 列 {{ editor.cursorCol }}</span>
    </div>
    <div class="status-right">
      <span class="status-item">{{ editor.wordCount }} 字</span>
      <span class="status-sep">|</span>
      <span class="status-item">UTF-8</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ app.layoutMode === 'edit-left' ? '左编辑 右预览' : app.layoutMode === 'edit-right' ? '左预览 右编辑' : app.layoutMode === 'edit-only' ? '仅编辑' : '仅预览' }}</span>
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

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-sep {
  color: rgba(255, 255, 255, 0.1);
}

:global(.light) .status-bar {
  background: #ffffff;
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}

:global(.light) .status-sep {
  color: rgba(0, 0, 0, 0.1);
}
</style>
