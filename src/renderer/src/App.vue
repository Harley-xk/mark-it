<script setup lang="ts">
import AppLayout from './components/layout/AppLayout.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import UpdateNotice from './components/update/UpdateNotice.vue'
import { useOutline } from './composables/useOutline'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useScrollbarState } from './composables/useScrollbarState'
import { useWindowZoom } from './composables/useWindowZoom'
import { useConfirmDialog, resolveConfirm, confirmUnsaved } from './composables/useConfirmUnsaved'
import { useDocumentsStore } from './stores/documents'
import { useUpdateStore } from './stores/update'
import { useFile } from './composables/useFile'
import { useSession } from './composables/useSession'

useOutline()
useKeyboardShortcuts()
useScrollbarState()
useWindowZoom()
// 负责启动时恢复上次打开的文档，并在关闭/更新重启前保存会话
const { flush: flushSession } = useSession()

const docs = useDocumentsStore()
const update = useUpdateStore()
update.init()
const file = useFile()
const { showConfirm, confirmTitle, confirmMessage, confirmSaveText, confirmDiscardText } =
  useConfirmDialog()

// macOS Cmd+W 被系统菜单占用，由主进程拦截后转交这里关闭标签页
window.api.onCloseTabShortcut(() => {
  file.closeTab()
})

// 监听窗口关闭请求：逐个检查所有标签页的未保存修改
window.api.onCloseRequest(async () => {
  const modified = docs.docs.filter((doc) => doc.isModified)
  for (const doc of modified) {
    const action = await confirmUnsaved(
      '关闭窗口',
      `「${doc.name}」有未保存的修改，是否在关闭前保存？`,
      undefined,
      true
    )
    if (action === 'cancel') return
    if (action === 'save' && !(await file.saveDocument(doc))) return
  }
  // 记录当前标签页，下次启动恢复
  await flushSession()
  // 销毁 close 监听器后真正关闭
  window.api.close()
})
</script>

<template>
  <AppLayout />
  <ConfirmDialog
    :visible="showConfirm"
    :title="confirmTitle"
    :message="confirmMessage"
    :save-text="confirmSaveText"
    :discard-text="confirmDiscardText"
    @save="resolveConfirm('save')"
    @discard="resolveConfirm('discard')"
    @cancel="resolveConfirm('cancel')"
  />
  <UpdateNotice />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family:
    'Segoe UI',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
}

body {
  background: transparent;
}

/* 滚动条：固定 12px 始终占位（宽度不变，避免内容抖动），
   平时淡显，悬停/滚动时点亮，拖动时高亮（VS Code 风格）。
   悬停状态由 useScrollbarState 以 sb-active 类维护 —— CSS :hover 会在
   鼠标进入标题栏拖拽区等不派发事件的区域时卡住不消失 */
::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 6px;
}

.sb-active::-webkit-scrollbar-thumb,
.sb-scrolling::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
}

.sb-active::-webkit-scrollbar-thumb:active {
  background: rgba(255, 255, 255, 0.5);
}

.light ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.14);
}

.light .sb-active::-webkit-scrollbar-thumb,
.light .sb-scrolling::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
}

.light .sb-active::-webkit-scrollbar-thumb:active {
  background: rgba(0, 0, 0, 0.5);
}

/* ── Mermaid 图表查看器（缩放 / 下载） ── */

.mermaid-diagram {
  position: relative;
}

.mermaid-viewport {
  display: flex;
  justify-content: center;
  max-height: 70vh;
  overflow: auto;
}

/* 放大后从左上角开始排列，保证滚动条可以覆盖整张图 */
.mermaid-diagram.zoomed .mermaid-viewport {
  justify-content: flex-start;
}

.mermaid-canvas {
  flex: 0 0 auto;
}

.mermaid-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: rgba(30, 30, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  /* 默认淡显，保证功能可发现；悬停时完全显示 */
  opacity: 0.6;
  transition: opacity 0.15s ease;
  user-select: none;
}

.mermaid-diagram:hover .mermaid-toolbar,
.mermaid-toolbar:focus-within {
  opacity: 1;
}

.mermaid-toolbar-btn {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 11px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.mermaid-toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.mermaid-zoom-label {
  min-width: 42px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.55);
}

.light .mermaid-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.light .mermaid-toolbar-btn {
  color: rgba(0, 0, 0, 0.6);
}

.light .mermaid-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.light .mermaid-zoom-label {
  color: rgba(0, 0, 0, 0.5);
}

/* 图表渲染失败的提示（原始代码块仍保留在上方） */
.preview-content .mermaid-error {
  margin: 8px 0 1.2em;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #d97706;
  background: rgba(217, 119, 6, 0.08);
  border: 1px solid rgba(217, 119, 6, 0.25);
  white-space: pre-wrap;
  word-break: break-word;
}

.light .preview-content .mermaid-error {
  color: #b45309;
  background: rgba(180, 83, 9, 0.06);
  border-color: rgba(180, 83, 9, 0.2);
}
</style>
