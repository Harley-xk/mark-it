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
  // 当前标签的预览内容根节点：多预览层共存时，按 id / 锚点定位必须限定在这一层内
  const previewContent = shallowRef<HTMLElement | null>(null)

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

  function setPreviewContent(element: HTMLElement | null): void {
    previewContent.value = element
  }

  return {
    content,
    cursorLine,
    cursorCol,
    wordCount,
    headings,
    editorView,
    previewContent,
    setCursor,
    setHeadings,
    setEditorView,
    setPreviewContent
  }
})
