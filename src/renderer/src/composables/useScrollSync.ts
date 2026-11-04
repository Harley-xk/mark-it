import type { EditorView } from '@codemirror/view'

// Module-level shared state (singleton across all components)
const scrollRegistry = {
  editorView: null as EditorView | null,
  previewEl: null as HTMLElement | null,
  isSyncing: false
}

interface UseScrollSync {
  suspendSync: () => void
  registerEditor: (view: EditorView) => void
  unregisterEditor: () => void
  registerPreview: (el: HTMLElement) => void
  unregisterPreview: () => void
}

export function useScrollSync(): UseScrollSync {
  // 每个组件实例只登记/注销自己注册的元素。布局切换时新旧实例的挂载/卸载
  // 顺序不固定（预览还要等异步渲染完成后才注册），注销时若无条件清空全局
  // 登记，会把另一个实例刚注册的元素一并清掉——表现为切换一次布局后
  // 编辑区与预览区永久失去滚动联动。
  let registeredView: EditorView | null = null
  let registeredPreview: HTMLElement | null = null

  function onEditorScroll(): void {
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

  function onPreviewScroll(): void {
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

  /**
   * 暂时屏蔽双向同步：用于切换标签时由代码设置滚动位置，
   * 避免恢复程序自己写入的滚动被同步逻辑反向覆盖。
   * 滚动事件在本帧的绘制步骤中触发，rAF 时解除即可覆盖到。
   */
  function suspendSync(): void {
    scrollRegistry.isSyncing = true
    requestAnimationFrame(() => {
      scrollRegistry.isSyncing = false
    })
  }

  function registerEditor(view: EditorView): void {
    if (registeredView && registeredView !== view) {
      registeredView.scrollDOM.removeEventListener('scroll', onEditorScroll)
    }
    registeredView = view
    scrollRegistry.editorView = view
    view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
  }

  function unregisterEditor(): void {
    if (!registeredView) return
    registeredView.scrollDOM.removeEventListener('scroll', onEditorScroll)
    // 只有全局登记仍指向本实例时才清空，避免误伤更新的实例
    if (scrollRegistry.editorView === registeredView) scrollRegistry.editorView = null
    registeredView = null
  }

  function registerPreview(el: HTMLElement): void {
    if (registeredPreview && registeredPreview !== el) {
      registeredPreview.removeEventListener('scroll', onPreviewScroll)
    }
    registeredPreview = el
    scrollRegistry.previewEl = el
    el.addEventListener('scroll', onPreviewScroll, { passive: true })
  }

  function unregisterPreview(): void {
    if (!registeredPreview) return
    registeredPreview.removeEventListener('scroll', onPreviewScroll)
    if (scrollRegistry.previewEl === registeredPreview) scrollRegistry.previewEl = null
    registeredPreview = null
  }

  return { suspendSync, registerEditor, unregisterEditor, registerPreview, unregisterPreview }
}