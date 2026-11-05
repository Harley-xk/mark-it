<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'

const editor = useEditorStore()
const app = useAppStore()

const pdfStatusText = computed(() => {
  switch (app.pdfExportStatus) {
    case 'exporting':
      return '导出中…'
    case 'success':
      return '导出成功'
    case 'error':
      return '导出失败'
    default:
      return ''
  }
})
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ app.fileName }}</span>
      <template v-if="app.showEditor">
        <span class="status-sep">|</span>
        <span class="status-item">行 {{ editor.cursorLine }}, 列 {{ editor.cursorCol }}</span>
      </template>
    </div>
    <div class="status-right">
      <template v-if="app.pdfExportStatus !== 'idle'">
        <span
          class="status-item status-export"
          :class="`is-${app.pdfExportStatus}`"
          :title="
            app.pdfExportStatus === 'error' ? 'PDF 导出失败，详情见开发者工具控制台' : undefined
          "
        >
          <span
            v-if="app.pdfExportStatus === 'exporting'"
            class="status-spinner"
            aria-hidden="true"
          ></span>
          {{ pdfStatusText }}
        </span>
        <span class="status-sep">|</span>
      </template>
      <template v-if="app.sessionSaveFailed">
        <span
          class="status-item status-warning"
          title="无法写入会话文件，下次启动可能无法恢复标签页"
        >
          会话保存失败
        </span>
        <span class="status-sep">|</span>
      </template>
      <span class="status-item">{{ editor.wordCount }} 字</span>
      <span class="status-sep">|</span>
      <span class="status-item">UTF-8</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{
        app.layoutMode === 'edit-left'
          ? '左编辑 右预览'
          : app.layoutMode === 'edit-right'
            ? '左预览 右编辑'
            : app.layoutMode === 'edit-only'
              ? '仅编辑'
              : '仅预览'
      }}</span>
      <template v-if="app.zoomPercent !== 100">
        <span class="status-sep">|</span>
        <span class="status-item" title="Ctrl/Cmd + 0 恢复 100%">缩放 {{ app.zoomPercent }}%</span>
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

.status-export {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.status-export.is-success {
  color: #4ade80;
}

.status-export.is-error {
  color: #e0a04a;
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

:global(.light) .status-bar {
  background: #ffffff;
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}

:global(.light) .status-sep {
  color: rgba(0, 0, 0, 0.1);
}

:global(.light) .status-warning {
  color: #b45309;
}

:global(.light) .status-export.is-success {
  color: #15803d;
}

:global(.light) .status-export.is-error {
  color: #b45309;
}
</style>
