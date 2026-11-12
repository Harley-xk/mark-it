import { watch } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useDocumentsStore, type DocumentTab } from '../stores/documents'
import { parseFrontmatter } from '../utils/frontmatter'
import { parseHeadings } from '../utils/headings'
import type { HeadingItem } from '../types'

/**
 * 每个标签最近一次生成大纲时对应的正文。
 * 切换标签时内容没变就直接复用 DocumentTab.headings，避免整篇重新解析；
 * WeakMap 以标签对象为键，标签关闭后自动释放。
 */
const headingSources = new WeakMap<DocumentTab, string>()

export function useOutline(): void {
  const editorStore = useEditorStore()
  const docs = useDocumentsStore()

  /**
   * 与预览共用同一套标题解析（markdown-it）：
   * ATX 与 Setext 标题都识别，代码块内的 # 不会被误判，
   * heading-N 的编号顺序也与预览锚点一致。
   */
  function extractHeadings(content: string): HeadingItem[] {
    // frontmatter 不参与正文解析（其中的 # 注释不能被当成标题）
    const { body, bodyStartLine } = parseFrontmatter(content)
    const headings = parseHeadings(body).map((heading) => ({
      ...heading,
      // 行号补上 frontmatter 占用的行数，供仅编辑模式滚动编辑器使用
      line: heading.line + bodyStartLine
    }))
    return buildTree(headings)
  }

  function buildTree(
    items: { id: string; level: number; text: string; line: number }[]
  ): HeadingItem[] {
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

  // 同时跟踪内容与当前标签：内容变化时重新解析，切换标签时命中缓存则直接复用
  watch(
    () => [docs.activeId, editorStore.content] as const,
    () => {
      const doc = docs.activeDoc
      if (!doc) return
      if (headingSources.get(doc) === doc.content) return
      editorStore.setHeadings(extractHeadings(doc.content))
      headingSources.set(doc, doc.content)
    },
    { immediate: true }
  )
}
