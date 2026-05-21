import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { EditorView } from '@codemirror/view'
import type { HeadingItem } from '../types'

export const useEditorStore = defineStore('editor', () => {
  const content = ref(`# Welcome to MarkIt

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
`)

  const cursorLine = ref(1)
  const cursorCol = ref(1)
  const wordCount = ref(0)
  const headings = ref<HeadingItem[]>([])
  const editorView = shallowRef<EditorView | null>(null)

  function setContent(val: string) {
    content.value = val
  }

  function setCursor(line: number, col: number) {
    cursorLine.value = line
    cursorCol.value = col
  }

  function setHeadings(items: HeadingItem[]) {
    headings.value = items
  }

  function setWordCount(count: number) {
    wordCount.value = count
  }

  function setEditorView(view: EditorView | null) {
    editorView.value = view
  }

  return {
    content, cursorLine, cursorCol, wordCount, headings, editorView,
    setContent, setCursor, setHeadings, setWordCount, setEditorView
  }
})
