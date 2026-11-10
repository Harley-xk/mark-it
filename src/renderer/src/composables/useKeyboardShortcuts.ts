import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useDocumentsStore } from '../stores/documents'
import { useEditorStore } from '../stores/editor'
import { useSearchStore } from '../stores/search'
import { useFile } from './useFile'
import { applyFormatAction, formatActions } from './useFormatActions'

export function useKeyboardShortcuts(): void {
  const app = useAppStore()
  const docs = useDocumentsStore()
  const editor = useEditorStore()
  const search = useSearchStore()
  const file = useFile()

  function isCtrl(e: KeyboardEvent): boolean {
    return e.ctrlKey || e.metaKey
  }

  /** 打开搜索：若当前有单行选中文本（≤200 字符）则带入查询框 */
  function openSearch(withReplace: boolean): void {
    const view = editor.editorView
    let selected = ''
    if (view) {
      const { from, to } = view.state.selection.main
      if (to > from) selected = view.state.sliceDoc(from, to)
    } else {
      selected = window.getSelection()?.toString() ?? ''
    }
    if (selected && !selected.includes('\n') && selected.length <= 200) {
      search.query = selected
    }
    search.open(withReplace)
  }

  function handleKeydown(e: KeyboardEvent): void {
    // 搜索面板打开时：F3 / Shift+F3 导航，Esc 关闭
    if (search.isOpen) {
      if (e.key === 'F3') {
        e.preventDefault()
        if (e.shiftKey) search.previous()
        else search.next()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        search.close()
        return
      }
    }

    // Ctrl+F: 搜索；Ctrl+H: 搜索并展开替换
    if (isCtrl(e) && !e.shiftKey && e.key === 'f') {
      e.preventDefault()
      openSearch(false)
      return
    }

    if (isCtrl(e) && !e.shiftKey && e.key === 'h') {
      e.preventDefault()
      openSearch(true)
      return
    }

    // Ctrl+Shift+N: 新建编辑窗口
    if (isCtrl(e) && e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      void window.api.createWindow()
      return
    }

    // Ctrl+N: 新建标签页
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
    // 注意：必须只匹配 Ctrl —— macOS 的 Cmd+Tab 是系统应用切换器，
    // 用 isCtrl（会匹配 metaKey）会拦截系统快捷键
    if (e.ctrlKey && e.key === 'Tab') {
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
      void window.api.settings.open()
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
