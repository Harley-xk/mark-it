<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, rectangularSelection, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { tags } from '@lezer/highlight'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'

const editorStore = useEditorStore()
const appStore = useAppStore()
const editorRef = ref<HTMLDivElement>()
let view: EditorView | null = null

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
  { tag: tags.processingInstruction, color: '#c678dd' },
])

onMounted(() => {
  if (!editorRef.value) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      editorStore.setContent(update.state.doc.toString())
      editorStore.setWordCount(update.state.doc.toString().replace(/\s/g, '').length)
    }
    const pos = update.state.selection.main.head
    const line = update.state.doc.lineAt(pos)
    editorStore.setCursor(line.number, pos - line.from + 1)
  })

  view = new EditorView({
    state: EditorState.create({
      doc: editorStore.content,
      extensions: [
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
        syntaxHighlighting(markitDark),
        oneDark,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" },
          '.cm-gutters': { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)' },
          '.cm-activeLineGutter': { background: 'rgba(108,155,255,0.08)', color: 'rgba(255,255,255,0.5)' },
          '.cm-activeLine': { background: 'rgba(108,155,255,0.04)' },
          '.cm-selectionBackground': { background: 'rgba(108,155,255,0.2) !important' },
          '.cm-cursor': { borderLeftColor: '#6c9bff' },
          '.cm-foldGutter': { opacity: 0.3 },
        }),
        updateListener,
      ],
    }),
    parent: editorRef.value,
  })

  editorStore.setEditorView(view)
})

onUnmounted(() => {
  editorStore.setEditorView(null)
  view?.destroy()
})

watch(() => editorStore.content, (newVal) => {
  if (view && newVal !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal }
    })
  }
})
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
