<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onUnmounted, watch } from 'vue'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  rectangularSelection,
  drawSelection
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  defaultHighlightStyle,
  HighlightStyle
} from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { tags } from '@lezer/highlight'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useDocumentsStore } from '../../stores/documents'
import { useScrollSync } from '../../composables/useScrollSync'

const editorStore = useEditorStore()
const appStore = useAppStore()
const docs = useDocumentsStore()
const { registerEditor, unregisterEditor } = useScrollSync()
const editorRef = ref<HTMLDivElement>()
let view: EditorView | null = null

// 主题 compartment 定义在模块级：EditorState 会被缓存并在组件重新挂载后复用，
// 共享同一个 compartment 才能保证重新配置主题时生效
const themeCompartment = new Compartment()

// 以编程方式替换文档内容时置位，避免被当成用户输入标记为已修改
let isExternalUpdate = false

const markitDark = HighlightStyle.define([
  { tag: tags.heading1, color: '#e8e8f0', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading2, color: '#d8d8f0', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading3, color: '#c8c8f0', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.heading4, color: '#b8b8e8', fontWeight: 'bold' },
  { tag: tags.heading5, color: '#a8a8e0', fontWeight: 'bold' },
  { tag: tags.heading6, color: '#9898d8', fontWeight: 'bold' },
  { tag: tags.strong, color: '#e0e0f0', fontWeight: 'bold' },
  { tag: tags.emphasis, color: '#d0d0f0', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#888', textDecoration: 'line-through' },
  { tag: tags.link, color: '#6c9bff' },
  { tag: tags.url, color: '#6c9bff' },
  { tag: tags.monospace, color: '#98c379', backgroundColor: 'rgba(152, 195, 121, 0.1)' },
  { tag: tags.quote, color: '#888', fontStyle: 'italic' },
  { tag: tags.meta, color: '#c678dd' },
  { tag: tags.processingInstruction, color: '#c678dd' }
])

const markitLight = HighlightStyle.define([
  { tag: tags.heading1, color: '#1a1a2e', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading2, color: '#2a2a3e', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading3, color: '#3a3a4e', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.heading4, color: '#4a4a5e', fontWeight: 'bold' },
  { tag: tags.heading5, color: '#5a5a6e', fontWeight: 'bold' },
  { tag: tags.heading6, color: '#6a6a7e', fontWeight: 'bold' },
  { tag: tags.strong, color: '#1a1a2e', fontWeight: 'bold' },
  { tag: tags.emphasis, color: '#2a2a4e', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#888', textDecoration: 'line-through' },
  { tag: tags.link, color: '#3b82f6' },
  { tag: tags.url, color: '#3b82f6' },
  { tag: tags.monospace, color: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  { tag: tags.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.meta, color: '#7c3aed' },
  { tag: tags.processingInstruction, color: '#7c3aed' }
])

const darkEditorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
  },
  '.cm-gutters': { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)' },
  '.cm-activeLineGutter': { background: 'rgba(108,155,255,0.08)', color: 'rgba(255,255,255,0.5)' },
  '.cm-activeLine': { background: 'rgba(108,155,255,0.04)' },
  '.cm-selectionBackground': { background: 'rgba(108,155,255,0.2) !important' },
  '.cm-cursor': { borderLeftColor: '#6c9bff' },
  '.cm-foldGutter': { opacity: 0.3 }
})

const lightEditorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
  },
  '.cm-gutters': { background: 'transparent', border: 'none', color: 'rgba(0,0,0,0.15)' },
  '.cm-activeLineGutter': { background: 'rgba(59,130,246,0.06)', color: 'rgba(0,0,0,0.4)' },
  '.cm-activeLine': { background: 'rgba(59,130,246,0.04)' },
  '.cm-selectionBackground': { background: 'rgba(59,130,246,0.15) !important' },
  '.cm-cursor': { borderLeftColor: '#3b82f6' },
  '.cm-foldGutter': { opacity: 0.3 }
})

function getThemeExtensions(isDark: boolean): Extension[] {
  return isDark
    ? [oneDark, syntaxHighlighting(markitDark), darkEditorTheme]
    : [syntaxHighlighting(markitLight), lightEditorTheme]
}

const updateListener = EditorView.updateListener.of((update) => {
  const id = docs.activeId
  if (!id) return

  if (update.docChanged && !isExternalUpdate) {
    // 内容与字数由 documents store 统一维护
    docs.updateContent(id, update.state.doc.toString())
  }

  const pos = update.state.selection.main.head
  const line = update.state.doc.lineAt(pos)
  docs.setCursor(id, line.number, pos - line.from + 1)
})

/**
 * 编辑区内默认禁止"拖动选中文字"。
 * CodeMirror 默认允许按住选中文本拖动（原生拖放会执行 move.drop），
 * 鼠标拖选时一旦从已有选区起手，就会把整段文本搬到落点，表现为
 * "文字被拖动换了位置、代码块被重排"。按住 Ctrl/Cmd 拖动仍可复制。
 */
const blockTextDrag = EditorView.domEventHandlers({
  dragstart: (event) => {
    if (event.ctrlKey || event.metaKey) return false
    event.preventDefault()
    return true
  }
})

function buildExtensions(isDark: boolean): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    themeCompartment.of(getThemeExtensions(isDark)),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    blockTextDrag,
    updateListener
  ]
}

/** 把 1 基的行列换算为文档偏移量（恢复会话中的光标位置） */
function cursorOffset(content: string, line: number, col: number): number {
  const lines = content.split('\n')
  const target = Math.min(Math.max(line, 1), lines.length)
  let offset = 0
  for (let i = 0; i < target - 1; i++) offset += lines[i].length + 1
  return offset + Math.min(Math.max(col - 1, 0), lines[target - 1]?.length ?? 0)
}

function createState(
  content: string,
  isDark: boolean,
  cursor?: { cursorLine: number; cursorCol: number }
): EditorState {
  return EditorState.create({
    doc: content,
    extensions: buildExtensions(isDark),
    ...(cursor
      ? { selection: { anchor: cursorOffset(content, cursor.cursorLine, cursor.cursorCol) } }
      : {})
  })
}

function saveScroll(id: string): void {
  if (!view) return
  const top = view.scrollDOM.scrollTop
  // 顶部可见行的文档偏移（+8 与 CodeMirror 内部的滚动锚点保持一致）
  const anchor = view.lineBlockAtHeight(top + 8).from
  docs.setScrollPosition(id, { top, anchor })
}

function restoreScroll(id: string): void {
  if (!view) return
  const saved = docs.getScrollPosition(id)

  if (saved.anchor > 0) {
    // 必须按"文档位置"而不是像素恢复：setState 之后 CodeMirror 的高度表是按
    // 默认行高估算的（14px，实际约 19.6px），直接写 scrollTop 会被 CM 以估算
    // 出的错误锚点行二次修正，造成可视内容与高度表错位——此时点击光标会落到
    // 相邻行、拖选范围错乱。scrollIntoView 在测量完成后按真实 DOM 定位。
    view.dispatch({
      effects: EditorView.scrollIntoView(saved.anchor, { y: 'start' })
    })
  } else if (saved.top > 0) {
    view.scrollDOM.scrollTop = saved.top
  } else {
    // 新文档 / 从未滚动过：必须显式滚到开头。setState 后滚动容器会保留上一个
    // 标签的像素偏移，直接赋值 scrollTop 可能因容器尚未重新渲染而无效
    view.dispatch({
      effects: EditorView.scrollIntoView(0, { y: 'start' })
    })
  }
  view.requestMeasure()
}

/** 窗口重新可见 / 获得焦点时强制复测，修正隐藏期间可能失效的行高缓存 */
function refreshMeasure(): void {
  view?.requestMeasure()
}

onMounted(() => {
  if (!editorRef.value) return

  const doc = docs.activeDoc
  if (!doc) return

  const isDark = appStore.resolvedTheme === 'dark'
  const cached = docs.getEditorState(doc.id)
  const state = cached ?? createState(doc.content, isDark, doc)

  view = new EditorView({ state, parent: editorRef.value })

  if (cached) {
    // 缓存的状态可能是在另一套主题下创建的
    view.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(isDark))
    })
  }

  editorStore.setEditorView(view)
  registerEditor(view)
  restoreScroll(doc.id)

  window.addEventListener('focus', refreshMeasure)
  document.addEventListener('visibilitychange', refreshMeasure)
  // 首帧布局完成后再复测一次：窗口 show 前挂载时测量可能不在最终布局上
  requestAnimationFrame(refreshMeasure)
})

// 卸载前 DOM 还挂在文档上，只有此时才能读到真实的滚动位置；
// onUnmounted 时元素已从 DOM 移除，scrollTop 会变成 0
onBeforeUnmount(() => {
  const activeId = docs.activeId
  if (view && activeId && docs.getDoc(activeId)) saveScroll(activeId)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshMeasure)
  document.removeEventListener('visibilitychange', refreshMeasure)

  // 只切到"仅预览"布局时组件会被卸载，缓存状态以便恢复撤销历史
  const activeId = docs.activeId
  if (view && activeId && docs.getDoc(activeId)) {
    docs.setEditorState(activeId, view.state)
  }

  unregisterEditor()
  editorStore.setEditorView(null)
  view?.destroy()
  view = null
})

// 切换标签：缓存旧标签状态，恢复新标签状态
watch(
  () => docs.activeId,
  (newId, oldId) => {
    if (!view || !newId) return

    if (oldId && docs.getDoc(oldId)) {
      docs.setEditorState(oldId, view.state)
      saveScroll(oldId)
    }

    const doc = docs.getDoc(newId)
    if (!doc) return

    const isDark = appStore.resolvedTheme === 'dark'
    const cached = docs.getEditorState(newId)

    isExternalUpdate = true
    if (cached) {
      view.setState(cached)
      view.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtensions(isDark))
      })
    } else {
      view.setState(createState(doc.content, isDark, doc))
    }
    isExternalUpdate = false

    editorStore.setEditorView(view)
    // 先聚焦再恢复滚动：聚焦 contenteditable 时浏览器会把光标滚进可视区，
    // 顺序反了会覆盖刚恢复的滚动位置
    view.focus()
    restoreScroll(newId)
  },
  { flush: 'sync' }
)

watch(
  () => appStore.resolvedTheme,
  (theme) => {
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(theme === 'dark'))
    })
  }
)

// 外部替换当前标签内容（刷新磁盘文件 / 载入文件）时同步到编辑器
watch(
  () => docs.activeDoc?.content,
  (newVal) => {
    if (!view || newVal === undefined || isExternalUpdate) return
    if (newVal !== view.state.doc.toString()) {
      isExternalUpdate = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newVal }
      })
      isExternalUpdate = false
    }
  }
)
</script>

<template>
  <div ref="editorRef" class="editor-container"></div>
</template>

<style scoped>
.editor-container {
  width: 100%;
  height: 100%;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
  background: transparent;
}

.editor-container :deep(.cm-focused) {
  outline: none;
}
</style>
