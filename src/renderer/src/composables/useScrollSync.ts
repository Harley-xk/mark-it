import type { EditorView } from '@codemirror/view'

// Module-level shared state (singleton across all components)
const scrollRegistry = {
  editorView: null as EditorView | null,
  previewEl: null as HTMLElement | null,
  isSyncing: false,
  // 切换标签 / 布局恢复滚动期间必须持续屏蔽联动，不能按帧计时：
  // 预览内容是异步渲染的（Mermaid、图片、表格列宽），渲染前后的高度不同，
  // 期间产生的滚动事件若参与联动，会按新旧高度比例反复改写两侧位置，
  // 每切一次标签就累积一段偏移。
  suspendCount: 0
}

interface UseScrollSync {
  /** 屏蔽滚动联动，返回幂等的释放函数；必须与调用一一配对 */
  suspendSync: () => () => void
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
    if (
      scrollRegistry.isSyncing ||
      scrollRegistry.suspendCount > 0 ||
      !scrollRegistry.previewEl ||
      !scrollRegistry.editorView
    )
      return
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
    if (
      scrollRegistry.isSyncing ||
      scrollRegistry.suspendCount > 0 ||
      !scrollRegistry.editorView ||
      !scrollRegistry.previewEl
    )
      return
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
   * 屏蔽双向同步：用于切换标签时由代码恢复滚动位置。
   * 返回的释放函数幂等；调用方按配对释放，计数归零后联动才恢复。
   */
  function suspendSync(): () => void {
    scrollRegistry.suspendCount += 1
    let released = false
    return () => {
      if (released) return
      released = true
      scrollRegistry.suspendCount = Math.max(0, scrollRegistry.suspendCount - 1)
    }
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
