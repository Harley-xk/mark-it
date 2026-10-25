import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EditorState } from '@codemirror/state'
import type { HeadingItem } from '../types'

export interface DocumentTab {
  id: string
  path: string | null
  name: string
  content: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  wordCount: number
  headings: HeadingItem[]
}

const WELCOME_CONTENT = `# Welcome to MarkIt

A modern Markdown editor with live preview.

## Features

- **Live Preview** with style switching
- **Mermaid Diagrams** support
- **Math Formulas** via KaTeX
- **Multiple Layout Modes**
- **Auto-generated Outline**
- **PDF Export**

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Mermaid Diagram

\`\`\`mermaid
graph LR
    A[Edit] --> B[Parse]
    B --> C[Preview]
\`\`\`

## Table

| Feature | Status |
|---------|--------|
| Editor  | Done   |
| Preview | Done   |
| Export  | Done   |

> Start writing your Markdown here!
`

let docSequence = 0

function nextDocId(): string {
  docSequence += 1
  return `doc-${docSequence}`
}

function baseName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || 'untitled.md'
}

/** Windows 下路径大小写不敏感，统一后用于判断文件是否已打开 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
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
  const scrollPositions = new Map<string, number>()

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

  /** 打开磁盘文件：已打开过则直接激活对应标签，避免重复标签 */
  function openPathDocument(filePath: string, content: string): DocumentTab {
    const normalized = normalizePath(filePath)
    const existing = docs.value.find((d) => d.path !== null && normalizePath(d.path) === normalized)
    if (existing) {
      activeId.value = existing.id
      return existing
    }
    return addDocument(filePath, content)
  }

  function newDocument(content = '', filePath: string | null = null): DocumentTab {
    return addDocument(filePath, content)
  }

  function getDoc(id: string): DocumentTab | null {
    return docs.value.find((d) => d.id === id) ?? null
  }

  function activateDocument(id: string): void {
    if (docs.value.some((d) => d.id === id)) {
      activeId.value = id
    }
  }

  function closeDocument(id: string): void {
    const index = docs.value.findIndex((d) => d.id === id)
    if (index === -1) return

    const wasActive = activeId.value === id
    docs.value.splice(index, 1)
    editorStates.delete(id)
    scrollPositions.delete(id)

    if (docs.value.length === 0) {
      // 始终保留一个空白标签，避免整个编辑区进入无文档状态
      const blank = createTab(null, '')
      docs.value.push(blank)
      activeId.value = blank.id
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
    doc.isModified = false
    doc.wordCount = countWords(content)
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

  function setScrollPosition(id: string, top: number): void {
    scrollPositions.set(id, top)
  }

  function getScrollPosition(id: string): number {
    return scrollPositions.get(id) ?? 0
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
    getScrollPosition
  }
})
