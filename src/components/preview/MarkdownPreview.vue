<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useEditorStore } from '../../stores/editor'
import MarkdownIt from 'markdown-it'

const editorStore = useEditorStore()
const previewRef = ref<HTMLDivElement>()
let mermaidInitialized = false

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
})

const renderedHtml = computed(() => {
  const src = editorStore.content
  return md.render(src)
})

async function renderMermaid() {
  if (!previewRef.value) return
  const blocks = previewRef.value.querySelectorAll('code.language-mermaid')
  if (blocks.length === 0) return

  try {
    const mermaid = (await import('mermaid')).default
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      })
      mermaidInitialized = true
    }

    for (const block of blocks) {
      const parent = block.parentElement
      if (!parent || parent.tagName !== 'PRE') continue

      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
      const code = block.textContent || ''
      try {
        const { svg } = await mermaid.render(id, code)
        const div = document.createElement('div')
        div.classList.add('mermaid-diagram')
        div.innerHTML = svg
        parent.replaceWith(div)
      } catch {
        const div = document.createElement('div')
        div.classList.add('mermaid-error')
        div.textContent = 'Mermaid 渲染失败'
        parent.replaceWith(div)
      }
    }
  } catch {
    // mermaid not available
  }
}

watch(renderedHtml, async () => {
  await nextTick()
  await renderMermaid()
})

onMounted(async () => {
  await nextTick()
  await renderMermaid()
})
</script>

<template>
  <div ref="previewRef" class="preview-container">
    <div class="preview-content" v-html="renderedHtml"></div>
  </div>
</template>

<style scoped>
.preview-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 32px 40px;
  background: rgba(255, 255, 255, 0.02);
}

.preview-content {
  max-width: 800px;
  margin: 0 auto;
  line-height: 1.7;
  color: #d4d4d8;
}

.preview-content :deep(h1) {
  font-size: 2em;
  font-weight: 700;
  color: #f0f0f5;
  margin: 1.2em 0 0.6em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-content :deep(h2) {
  font-size: 1.5em;
  font-weight: 600;
  color: #e8e8f0;
  margin: 1em 0 0.5em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-content :deep(h3) {
  font-size: 1.25em;
  font-weight: 600;
  color: #e0e0ea;
  margin: 0.8em 0 0.4em;
}

.preview-content :deep(h4) { font-size: 1.1em; font-weight: 600; color: #d8d8e4; margin: 0.6em 0 0.3em; }
.preview-content :deep(h5) { font-size: 1em; font-weight: 600; color: #d0d0de; }
.preview-content :deep(h6) { font-size: 0.9em; font-weight: 600; color: #c0c0d0; }

.preview-content :deep(p) { margin: 0.6em 0; }

.preview-content :deep(a) {
  color: #6c9bff;
  text-decoration: none;
  border-bottom: 1px solid rgba(108, 155, 255, 0.3);
  transition: border-color 0.2s;
}

.preview-content :deep(a:hover) {
  border-bottom-color: #6c9bff;
}

.preview-content :deep(strong) { color: #f0f0f5; font-weight: 600; }
.preview-content :deep(em) { color: #d0d0f0; }

.preview-content :deep(code) {
  background: rgba(108, 155, 255, 0.1);
  color: #98c379;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.88em;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

.preview-content :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 16px 20px;
  overflow-x: auto;
  margin: 1em 0;
  backdrop-filter: blur(8px);
}

.preview-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: #d4d4d8;
  font-size: 0.85em;
}

.preview-content :deep(blockquote) {
  border-left: 3px solid rgba(108, 155, 255, 0.3);
  padding: 0.5em 1em;
  margin: 1em 0;
  background: rgba(108, 155, 255, 0.04);
  border-radius: 0 6px 6px 0;
  color: rgba(255, 255, 255, 0.6);
}

.preview-content :deep(ul), .preview-content :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.preview-content :deep(li) { margin: 0.25em 0; }

.preview-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.9em;
}

.preview-content :deep(th) {
  background: rgba(108, 155, 255, 0.08);
  font-weight: 600;
  text-align: left;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-content :deep(td) {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-content :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.02);
}

.preview-content :deep(hr) {
  border: none;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 1.5em 0;
}

.preview-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 1em 0;
}

.preview-content :deep(input[type="checkbox"]) {
  margin-right: 6px;
  accent-color: #6c9bff;
}

.preview-content :deep(.mermaid-diagram) {
  margin: 1em 0;
  text-align: center;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 16px;
}

.preview-content :deep(.mermaid-diagram svg) {
  max-width: 100%;
}

.preview-content :deep(.mermaid-error) {
  color: #ff6b6b;
  padding: 12px;
  background: rgba(255, 107, 107, 0.08);
  border-radius: 6px;
  border: 1px solid rgba(255, 107, 107, 0.2);
}
</style>
