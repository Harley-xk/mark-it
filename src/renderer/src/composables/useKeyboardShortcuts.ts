import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useDocumentsStore } from '../stores/documents'
import { useEditorStore } from '../stores/editor'
import { useFile } from './useFile'
import { applyFormatAction, formatActions } from './useFormatActions'

export function useKeyboardShortcuts() {
  const app = useAppStore()
  const docs = useDocumentsStore()
  const editor = useEditorStore()
  const file = useFile()

  function isCtrl(e: KeyboardEvent): boolean {
    return e.ctrlKey || e.metaKey
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+N: 新建
    if (isCtrl(e) && !e.shiftKey && e.key === 'n') {
      e.preventDefault()
      file.newFile()
      return
    }

    // Ctrl+O: 打开
    if (isCtrl(e) && !e.shiftKey && e.key === 'o') {
      e.preventDefault()
      file.openFile()
      return
    }

    // Ctrl+W: 关闭当前标签页
    if (isCtrl(e) && !e.shiftKey && e.key === 'w') {
      e.preventDefault()
      file.closeTab()
      return
    }

    // Ctrl+Tab / Ctrl+Shift+Tab: 切换标签页
    if (isCtrl(e) && e.key === 'Tab') {
      e.preventDefault()
      docs.cycleDocument(e.shiftKey ? -1 : 1)
      return
    }

    // Ctrl+1..9: 跳到第 N 个标签页
    if (isCtrl(e) && !e.shiftKey && /^[1-9]$/.test(e.key)) {
      const index = Number(e.key) - 1
      const target = docs.docs[index]
      if (target) {
        e.preventDefault()
        docs.activateDocument(target.id)
      }
      return
    }

    // Ctrl+S: 保存
    if (isCtrl(e) && !e.shiftKey && e.key === 's') {
      e.preventDefault()
      file.saveFile()
      return
    }

    // Ctrl+Shift+S: 另存为
    if (isCtrl(e) && e.shiftKey && e.key === 'S') {
      e.preventDefault()
      file.saveFileAs()
      return
    }

    // F5 / Ctrl+R: 刷新（重新读取磁盘上的文件）
    if (e.key === 'F5' || (isCtrl(e) && !e.shiftKey && e.key === 'r')) {
      e.preventDefault()
      file.refreshFile()
      return
    }

    // Ctrl+P: 导出 PDF
    if (isCtrl(e) && !e.shiftKey && e.key === 'p') {
      e.preventDefault()
      app.showPdfDialog = true
      return
    }

    // Ctrl+,: 设置
    if (isCtrl(e) && e.key === ',') {
      e.preventDefault()
      app.showSettingsDialog = !app.showSettingsDialog
      return
    }

    // Ctrl+Shift+O: 切换大纲
    if (isCtrl(e) && e.shiftKey && e.key === 'O') {
      e.preventDefault()
      app.toggleOutline()
      return
    }

    // Ctrl+\: 循环切换布局
    if (isCtrl(e) && e.key === '\\') {
      e.preventDefault()
      app.cycleLayout()
      return
    }

    // Ctrl+B: 加粗
    if (isCtrl(e) && !e.shiftKey && e.key === 'b') {
      e.preventDefault()
      applyFormatAction(editor.editorView, formatActions.bold)
      return
    }

    // Ctrl+I: 斜体
    if (isCtrl(e) && !e.shiftKey && e.key === 'i') {
      e.preventDefault()
      applyFormatAction(editor.editorView, formatActions.italic)
      return
    }

    // Ctrl+K: 链接
    if (isCtrl(e) && !e.shiftKey && e.key === 'k') {
      e.preventDefault()
      applyFormatAction(editor.editorView, formatActions.link)
      return
    }

    // Ctrl+Shift+K: 代码块
    if (isCtrl(e) && e.shiftKey && e.key === 'K') {
      e.preventDefault()
      applyFormatAction(editor.editorView, formatActions.codeblock)
      return
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
