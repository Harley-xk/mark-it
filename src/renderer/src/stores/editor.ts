import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { EditorView } from '@codemirror/view'
import type { HeadingItem } from '../types'
import { useDocumentsStore } from './documents'

/**
 * 编辑器视图状态。
 * 文档内容/光标/大纲等按标签保存在 documents store 中，
 * 这里以当前激活标签的视角对外暴露，保持既有调用方式不变。
 */
export const useEditorStore = defineStore('editor', () => {
  const documents = useDocumentsStore()
  const editorView = shallowRef<EditorView | null>(null)

  const content = computed(() => documents.activeDoc?.content ?? '')
  const cursorLine = computed(() => documents.activeDoc?.cursorLine ?? 1)
  const cursorCol = computed(() => documents.activeDoc?.cursorCol ?? 1)
  const wordCount = computed(() => documents.activeDoc?.wordCount ?? 0)
  const headings = computed<HeadingItem[]>(() => documents.activeDoc?.headings ?? [])

  function setCursor(line: number, col: number): void {
    if (documents.activeDoc) documents.setCursor(documents.activeDoc.id, line, col)
  }

  function setHeadings(items: HeadingItem[]): void {
    if (documents.activeDoc) documents.setHeadings(documents.activeDoc.id, items)
  }

  function setEditorView(view: EditorView | null): void {
    editorView.value = view
  }

  return {
    content,
    cursorLine,
    cursorCol,
    wordCount,
    headings,
    editorView,
    setCursor,
    setHeadings,
    setEditorView
  }
})
