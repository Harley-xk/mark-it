<script setup lang="ts">
import AppLayout from './components/layout/AppLayout.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import { useOutline } from './composables/useOutline'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useConfirmDialog, resolveConfirm, confirmUnsaved } from './composables/useConfirmUnsaved'
import { useEditorStore } from './stores/editor'
import { useAppStore } from './stores/app'
import { useFile } from './composables/useFile'

useOutline()
useKeyboardShortcuts()

const editor = useEditorStore()
const app = useAppStore()
const file = useFile()
const { showConfirm, confirmTitle, confirmMessage } = useConfirmDialog()

// 加载文件到编辑器的公共方法
function loadFile(result: { path: string; content: string }) {
  editor.setContent(result.content)
  app.filePath = result.path
  app.fileName = result.path.split(/[/\\]/).pop() || 'untitled.md'
  app.isModified = false
}

// 监听主进程发来的文件打开事件（右键"使用 MarkIt 打开" / 命令行传参）
window.api.onOpenFile(async (result) => {
  const action = await confirmUnsaved('打开文件', '当前文件有未保存的修改，是否在打开新文件前保存？')
  if (action === 'cancel') return
  if (action === 'save') await file.saveFile()
  loadFile(result)
})

// 监听窗口关闭请求
window.api.onCloseRequest(async () => {
  if (app.isModified) {
    const action = await confirmUnsaved('关闭窗口', '当前文件有未保存的修改，是否在关闭前保存？')
    if (action === 'cancel') return
    if (action === 'save') await file.saveFile()
  }
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
    @save="resolveConfirm('save')"
    @discard="resolveConfirm('discard')"
    @cancel="resolveConfirm('cancel')"
  />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}

body {
  background: transparent;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.light ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.light ::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
