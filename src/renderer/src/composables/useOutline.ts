import { watch } from 'vue'
import { useEditorStore } from '../stores/editor'
import type { HeadingItem } from '../types'

export function useOutline() {
  const editorStore = useEditorStore()

  function extractHeadings(content: string): HeadingItem[] {
    const lines = content.split('\n')
    const headings: { level: number; text: string; id: string; line: number }[] = []
    let inCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue

      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        const level = match[1].length
        const text = match[2].replace(/[#*`~\[\]]/g, '').trim()
        const id = `heading-${headings.length}`
        headings.push({ level, text, id, line: i + 1 })
      }
    }

    return buildTree(headings)
  }

  function buildTree(items: { level: number; text: string; id: string; line: number }[]): HeadingItem[] {
    const root: HeadingItem[] = []
    const stack: HeadingItem[] = []

    for (const item of items) {
      const node: HeadingItem = { ...item, children: [] }

      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop()
      }

      if (stack.length === 0) {
        root.push(node)
      } else {
        stack[stack.length - 1].children.push(node)
      }
      stack.push(node)
    }

    return root
  }

  watch(
    () => editorStore.content,
    (content) => {
      editorStore.setHeadings(extractHeadings(content))
    },
    { immediate: true }
  )
}
