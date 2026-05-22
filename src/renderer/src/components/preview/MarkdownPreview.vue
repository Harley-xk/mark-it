<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useStyle } from '../../composables/useStyle'
import StyleSelector from './StyleSelector.vue'
import MarkdownIt from 'markdown-it'

const editorStore = useEditorStore()
const appStore = useAppStore()
const { currentCss } = useStyle(() => appStore.resolvedTheme === 'dark')
const previewRef = ref<HTMLDivElement>()
let mermaidInitialized = false
let currentMermaidTheme: string | null = null

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
    const theme = appStore.resolvedTheme === 'dark' ? 'dark' : 'default'
    if (!mermaidInitialized || currentMermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'loose',
      })
      mermaidInitialized = true
      currentMermaidTheme = theme
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
  <div class="preview-wrapper">
    <div class="preview-toolbar">
      <StyleSelector />
    </div>
    <div ref="previewRef" class="preview-container">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <component :is="'style'">{{ currentCss }}</component>
      <div class="preview-content" v-html="renderedHtml"></div>
    </div>
  </div>
</template>

<style scoped>
.preview-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-toolbar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.preview-container {
  flex: 1;
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

:global(.light) .preview-toolbar {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:global(.light) .preview-container {
  background: rgba(0, 0, 0, 0.02);
}

:global(.light) .preview-content {
  color: #374151;
}
</style>
