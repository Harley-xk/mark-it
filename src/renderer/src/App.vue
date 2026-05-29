<script setup lang="ts">
import AppLayout from './components/layout/AppLayout.vue'
import { useOutline } from './composables/useOutline'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useEditorStore } from './stores/editor'
import { useAppStore } from './stores/app'

useOutline()
useKeyboardShortcuts()

// 监听主进程发来的文件打开事件（右键"使用 MarkIt 打开" / 命令行传参）
const editor = useEditorStore()
const app = useAppStore()

window.api.onOpenFile((result) => {
  editor.setContent(result.content)
  app.filePath = result.path
  app.fileName = result.path.split(/[/\\]/).pop() || 'untitled.md'
  app.isModified = false
})
</script>

<template>
  <AppLayout />
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
