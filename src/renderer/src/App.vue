<script setup lang="ts">
import AppLayout from './components/layout/AppLayout.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import UpdateNotice from './components/update/UpdateNotice.vue'
import { useOutline } from './composables/useOutline'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useScrollbarState } from './composables/useScrollbarState'
import { useConfirmDialog, resolveConfirm, confirmUnsaved } from './composables/useConfirmUnsaved'
import { useDocumentsStore } from './stores/documents'
import { useUpdateStore } from './stores/update'
import { useFile } from './composables/useFile'

useOutline()
useKeyboardShortcuts()
useScrollbarState()

const docs = useDocumentsStore()
const update = useUpdateStore()
update.init()
const file = useFile()
const { showConfirm, confirmTitle, confirmMessage, confirmSaveText, confirmDiscardText } =
  useConfirmDialog()

// 监听主进程发来的文件打开事件（右键"使用 MarkIt 打开" / 命令行传参）
// 以新标签页打开，不干扰当前编辑中的文档
window.api.onOpenFile((result) => {
  file.openFileFromPath(result)
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
</style>
