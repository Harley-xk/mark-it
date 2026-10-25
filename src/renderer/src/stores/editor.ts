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

  /** 编辑器内输入：更新当前标签内容并标记为已修改 */
  function setContent(val: string) {
    if (documents.activeDoc) documents.updateContent(documents.activeDoc.id, val)
  }

  function setCursor(line: number, col: number) {
    if (documents.activeDoc) documents.setCursor(documents.activeDoc.id, line, col)
  }

  function setHeadings(items: HeadingItem[]) {
    if (documents.activeDoc) documents.setHeadings(documents.activeDoc.id, items)
  }

  function setWordCount(count: number) {
    if (documents.activeDoc) documents.setWordCount(documents.activeDoc.id, count)
  }

  function setEditorView(view: EditorView | null) {
    editorView.value = view
  }

  return {
    content,
    cursorLine,
    cursorCol,
    wordCount,
    headings,
    editorView,
    setContent,
    setCursor,
    setHeadings,
    setWordCount,
    setEditorView
  }
})
