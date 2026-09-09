import type { EditorView } from '@codemirror/view'

// Module-level shared state (singleton across all components)
const scrollRegistry = {
  editorView: null as EditorView | null,
  previewEl: null as HTMLElement | null,
  isSyncing: false,
}

export function useScrollSync() {
  function onEditorScroll() {
    if (scrollRegistry.isSyncing || !scrollRegistry.previewEl || !scrollRegistry.editorView) return
    scrollRegistry.isSyncing = true
    const editorDOM = scrollRegistry.editorView.scrollDOM
    const previewEl = scrollRegistry.previewEl
    const maxScroll = editorDOM.scrollHeight - editorDOM.clientHeight
    if (maxScroll <= 0) { scrollRegistry.isSyncing = false; return }
    const ratio = editorDOM.scrollTop / maxScroll
    const previewMax = previewEl.scrollHeight - previewEl.clientHeight
    previewEl.scrollTop = ratio * previewMax
    requestAnimationFrame(() => { scrollRegistry.isSyncing = false })
  }

  function onPreviewScroll() {
    if (scrollRegistry.isSyncing || !scrollRegistry.editorView || !scrollRegistry.previewEl) return
    scrollRegistry.isSyncing = true
    const editorDOM = scrollRegistry.editorView.scrollDOM
    const previewEl = scrollRegistry.previewEl
    const maxScroll = previewEl.scrollHeight - previewEl.clientHeight
    if (maxScroll <= 0) { scrollRegistry.isSyncing = false; return }
    const ratio = previewEl.scrollTop / maxScroll
    const editorMax = editorDOM.scrollHeight - editorDOM.clientHeight
    editorDOM.scrollTop = ratio * editorMax
    requestAnimationFrame(() => { scrollRegistry.isSyncing = false })
  }

  function registerEditor(view: EditorView) {
    scrollRegistry.editorView = view
    view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
  }

  function unregisterEditor() {
    if (scrollRegistry.editorView) {
      scrollRegistry.editorView.scrollDOM.removeEventListener('scroll', onEditorScroll)
      scrollRegistry.editorView = null
    }
  }

  function registerPreview(el: HTMLElement) {
    scrollRegistry.previewEl = el
    el.addEventListener('scroll', onPreviewScroll, { passive: true })
  }

  function unregisterPreview() {
    if (scrollRegistry.previewEl) {
      scrollRegistry.previewEl.removeEventListener('scroll', onPreviewScroll)
      scrollRegistry.previewEl = null
    }
  }

  return { registerEditor, unregisterEditor, registerPreview, unregisterPreview }
}