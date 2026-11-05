import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EditorState } from '@codemirror/state'
import type { HeadingItem, LayoutMode } from '../types'
import type { SessionTab } from '../../../shared/session-types'
import { normalizePath } from '../utils/path'
import { isLayoutMode, loadSavedLayoutMode } from '../utils/layout-mode'
import { decodeText, normalizeToLf, type LineEnding } from '../utils/text-encoding'
import WELCOME_CONTENT from '../assets/welcome.md?raw'

export interface DocumentTab {
  id: string
  path: string | null
  name: string
  /** 编辑器内部内容，统一使用 LF 换行 */
  content: string
  /** 最近一次从磁盘载入 / 保存后的内容（LF），用于判断磁盘是否真的发生了变化 */
  diskContent: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  wordCount: number
  headings: HeadingItem[]
  /** 原文件换行符；保存时按此还原，避免整文件行尾 diff */
  eol: LineEnding
  /** 原文件是否带 UTF-8 BOM；保存时按此还原 */
  bom: boolean
  /** 当前标签的布局模式；切换标签时由 app.layoutMode 读取 */
  layoutMode: LayoutMode
}

export interface ScrollPosition {
  /** 像素滚动位置（兜底） */
  top: number
  /** 顶部可见行在文档中的起始偏移（切换标签后按此精确定位） */
  anchor: number
}

let docSequence = 0

function nextDocId(): string {
  docSequence += 1
  return `doc-${docSequence}`
}

function baseName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || 'untitled.md'
}

function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

export const useDocumentsStore = defineStore('documents', () => {
  const docs = ref<DocumentTab[]>([])
  const activeId = ref('')

  // CodeMirror 的 EditorState 体积大且不可序列化，放在响应式系统之外，
  // 用于保留每个标签的撤销历史、选区与滚动位置
  const editorStates = new Map<string, EditorState>()
  const scrollPositions = new Map<string, ScrollPosition>()
  // 预览区与编辑区是两套独立的滚动容器，预览按像素单独记录
  const previewScrollPositions = new Map<string, number>()

  const activeDoc = computed<DocumentTab | null>(
    () => docs.value.find((d) => d.id === activeId.value) ?? null
  )

  function uniqueUntitledName(): string {
    const names = new Set(docs.value.map((d) => d.name))
    if (!names.has('untitled.md')) return 'untitled.md'
    let index = 2
    while (names.has(`untitled-${index}.md`)) index += 1
    return `untitled-${index}.md`
  }

  /** 新标签默认继承当前激活标签的布局；没有激活标签时回退到最近一次使用的布局 */
  function defaultTabLayoutMode(): LayoutMode {
    const active = docs.value.find((d) => d.id === activeId.value)
    return active?.layoutMode ?? loadSavedLayoutMode()
  }

  function createTab(
    path: string | null,
    content: string,
    name?: string,
    meta?: { eol?: LineEnding; bom?: boolean; layoutMode?: LayoutMode }
  ): DocumentTab {
    // 编辑器内部统一使用 LF；原文件的换行符与 BOM 记在标签上，保存时还原
    const decoded = decodeText(content)
    const text = decoded.text
    return {
      id: nextDocId(),
      path,
      name: name || (path ? baseName(path) : uniqueUntitledName()),
      content: text,
      diskContent: text,
      isModified: false,
      cursorLine: 1,
      cursorCol: 1,
      wordCount: countWords(text),
      headings: [],
      eol: meta?.eol ?? decoded.eol,
      bom: meta?.bom ?? decoded.bom,
      layoutMode: meta?.layoutMode ?? defaultTabLayoutMode()
    }
  }

  function addDocument(path: string | null, content: string, name?: string): DocumentTab {
    const doc = createTab(path, content, name)
    docs.value.push(doc)
    activeId.value = doc.id
    return doc
  }

  /**
   * 启动时的默认占位标签（欢迎页或未编辑的空白页）。
   * 打开文件时可以直接替换它，避免额外留下一个 untitled 标签
   */
  function isPlaceholderTab(doc: DocumentTab): boolean {
    return doc.path === null && !doc.isModified
  }

  /** 打开磁盘文件：已打开过则直接激活对应标签，避免重复标签 */
  function openPathDocument(filePath: string, content: string): DocumentTab {
    const normalized = normalizePath(filePath)
    const existing = docs.value.find((d) => d.path !== null && normalizePath(d.path) === normalized)
    if (existing) {
      activeId.value = existing.id
      return existing
    }
    // 只有占位标签时直接替换，而不是在其旁边新建标签
    if (docs.value.length === 1 && isPlaceholderTab(docs.value[0])) {
      removeDocument(0)
    }
    return addDocument(filePath, content)
  }

  function newDocument(content = '', filePath: string | null = null): DocumentTab {
    return addDocument(filePath, content)
  }

  /**
   * 用上次会话的标签页替换当前内容（更新重启后恢复）。
   * 返回 false 表示会话为空、保持现有标签页不变
   */
  function restoreSession(tabs: SessionTab[], activeIndex: number): boolean {
    if (tabs.length === 0) return false

    editorStates.clear()
    scrollPositions.clear()
    previewScrollPositions.clear()

    const restored = tabs.map((tab) => {
      // 会话文件可能来自旧版本或被手工改坏：逐字段兜底，避免恢复时崩溃
      const path = typeof tab.path === 'string' && tab.path.length > 0 ? tab.path : null
      const content = typeof tab.content === 'string' ? tab.content : ''
      const name = typeof tab.name === 'string' && tab.name.length > 0 ? tab.name : undefined
      // 旧会话没有 layoutMode，按最近一次使用的布局兜底
      const layoutMode = isLayoutMode(tab.layoutMode) ? tab.layoutMode : loadSavedLayoutMode()
      const doc = createTab(path, content, name, { eol: tab.eol, bom: tab.bom, layoutMode })
      doc.isModified = tab.isModified === true
      doc.cursorLine = typeof tab.cursorLine === 'number' && tab.cursorLine > 0 ? tab.cursorLine : 1
      doc.cursorCol = typeof tab.cursorCol === 'number' && tab.cursorCol > 0 ? tab.cursorCol : 1
      return doc
    })

    docs.value = restored
    const index = Math.min(Math.max(Math.floor(activeIndex) || 0, 0), restored.length - 1)
    activeId.value = restored[index].id
    return true
  }

  function getDoc(id: string): DocumentTab | null {
    return docs.value.find((d) => d.id === id) ?? null
  }

  function activateDocument(id: string): void {
    if (docs.value.some((d) => d.id === id)) {
      activeId.value = id
    }
  }

  /** 移除指定下标的标签并清理其缓存状态 */
  function removeDocument(index: number): void {
    const [removed] = docs.value.splice(index, 1)
    if (!removed) return
    editorStates.delete(removed.id)
    scrollPositions.delete(removed.id)
    previewScrollPositions.delete(removed.id)
  }

  function closeDocument(id: string): void {
    const index = docs.value.findIndex((d) => d.id === id)
    if (index === -1) return

    const wasActive = activeId.value === id
    removeDocument(index)

    if (docs.value.length === 0) {
      // 最后一个标签已关闭：由调用方（useFile.closeTab）关闭主窗口
      activeId.value = ''
      return
    }

    if (wasActive) {
      const next = docs.value[Math.min(index, docs.value.length - 1)]
      activeId.value = next.id
    }
  }

  function cycleDocument(delta: number): void {
    if (docs.value.length < 2) return
    const index = docs.value.findIndex((d) => d.id === activeId.value)
    if (index === -1) return
    const length = docs.value.length
    activeId.value = docs.value[(index + delta + length) % length].id
  }

  function updateContent(id: string, content: string): void {
    const doc = getDoc(id)
    if (!doc) return
    const normalized = normalizeToLf(content)
    if (doc.content === normalized) return
    doc.content = normalized
    doc.isModified = true
    doc.wordCount = countWords(normalized)
  }

  /** 从磁盘载入内容（刷新 / 外部加载），不标记为已修改 */
  function replaceContent(id: string, content: string): void {
    const doc = getDoc(id)
    if (!doc) return
    // 磁盘内容可能是 CRLF / 带 BOM：统一为 LF 保存内部内容，并同步原文件的行尾策略
    const decoded = decodeText(content)
    doc.content = decoded.text
    doc.diskContent = decoded.text
    doc.eol = decoded.eol
    doc.bom = decoded.bom
    doc.isModified = false
    doc.wordCount = countWords(decoded.text)
    // 缓存的 EditorState 仍是旧内容；继续使用会让重新激活的标签显示过期文本
    editorStates.delete(id)
  }

  function setCursor(id: string, line: number, col: number): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.cursorLine = line
    doc.cursorCol = col
  }

  function setHeadings(id: string, headings: HeadingItem[]): void {
    const doc = getDoc(id)
    if (doc) doc.headings = headings
  }

  /** 设置某个标签的布局模式；不影响其他标签 */
  function setLayoutMode(id: string, mode: LayoutMode): void {
    const doc = getDoc(id)
    if (doc) doc.layoutMode = mode
  }

  /** 保存成功后调用；传入路径表示另存为 */
  function markSaved(id: string, filePath?: string): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.isModified = false
    doc.diskContent = doc.content
    if (filePath) {
      doc.path = filePath
      doc.name = baseName(filePath)
    }
  }

  function setEditorState(id: string, state: EditorState): void {
    editorStates.set(id, state)
  }

  function getEditorState(id: string): EditorState | null {
    return editorStates.get(id) ?? null
  }

  function setScrollPosition(id: string, position: ScrollPosition): void {
    scrollPositions.set(id, position)
  }

  function getScrollPosition(id: string): ScrollPosition {
    return scrollPositions.get(id) ?? { top: 0, anchor: 0 }
  }

  function setPreviewScrollPosition(id: string, top: number): void {
    previewScrollPositions.set(id, top)
  }

  /** 预览区滚动位置（像素）；没有记录（新文档）时从顶部开始 */
  function getPreviewScrollPosition(id: string): number {
    return previewScrollPositions.get(id) ?? 0
  }

  // 初始标签：欢迎示例文档
  const initial = createTab(null, WELCOME_CONTENT)
  docs.value.push(initial)
  activeId.value = initial.id

  return {
    docs,
    activeId,
    activeDoc,
    addDocument,
    openPathDocument,
    newDocument,
    restoreSession,
    getDoc,
    activateDocument,
    closeDocument,
    cycleDocument,
    updateContent,
    replaceContent,
    setCursor,
    setHeadings,
    setLayoutMode,
    markSaved,
    setEditorState,
    getEditorState,
    setScrollPosition,
    getScrollPosition,
    setPreviewScrollPosition,
    getPreviewScrollPosition
  }
})
