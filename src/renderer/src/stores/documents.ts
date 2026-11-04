import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EditorState } from '@codemirror/state'
import type { HeadingItem } from '../types'
import type { SessionTab } from '../../../shared/session-types'
import { normalizePath } from '../utils/path'
import WELCOME_CONTENT from '../assets/welcome.md?raw'

export interface DocumentTab {
  id: string
  path: string | null
  name: string
  content: string
  /** 最近一次从磁盘载入 / 保存后的内容，用于判断磁盘是否真的发生了变化 */
  diskContent: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  wordCount: number
  headings: HeadingItem[]
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

  function createTab(path: string | null, content: string, name?: string): DocumentTab {
    return {
      id: nextDocId(),
      path,
      name: name || (path ? baseName(path) : uniqueUntitledName()),
      content,
      diskContent: content,
      isModified: false,
      cursorLine: 1,
      cursorCol: 1,
      wordCount: countWords(content),
      headings: []
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
      const doc = createTab(tab.path, tab.content, tab.name)
      doc.isModified = tab.isModified
      doc.cursorLine = tab.cursorLine > 0 ? tab.cursorLine : 1
      doc.cursorCol = tab.cursorCol > 0 ? tab.cursorCol : 1
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
    if (!doc || doc.content === content) return
    doc.content = content
    doc.isModified = true
    doc.wordCount = countWords(content)
  }

  /** 从磁盘载入内容（刷新 / 外部加载），不标记为已修改 */
  function replaceContent(id: string, content: string): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.content = content
    doc.diskContent = content
    doc.isModified = false
    doc.wordCount = countWords(content)
    // 缓存的 EditorState 仍是旧内容；继续使用会让重新激活的标签显示过期文本
    editorStates.delete(id)
  }

  function setCursor(id: string, line: number, col: number): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.cursorLine = line
    doc.cursorCol = col
  }

  function setWordCount(id: string, count: number): void {
    const doc = getDoc(id)
    if (doc) doc.wordCount = count
  }

  function setHeadings(id: string, headings: HeadingItem[]): void {
    const doc = getDoc(id)
    if (doc) doc.headings = headings
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
    setWordCount,
    setHeadings,
    markSaved,
    setEditorState,
    getEditorState,
    setScrollPosition,
    getScrollPosition,
    setPreviewScrollPosition,
    getPreviewScrollPosition
  }
})
