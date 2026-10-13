<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useStyleStore } from '../../stores/style'
import { useScrollSync } from '../../composables/useScrollSync'
import MarkdownIt from 'markdown-it'

const editorStore = useEditorStore()
const appStore = useAppStore()
const styleStore = useStyleStore()
const { registerPreview, unregisterPreview } = useScrollSync()
const previewRef = ref<HTMLDivElement>()
let mermaidInitialized = false
let currentMermaidTheme: string | null = null

const isDark = computed(() => appStore.resolvedTheme === 'dark')
const currentCss = computed(() => styleStore.currentCss(isDark.value))

const contentStyle = computed(() => ({
  maxWidth:
    appStore.previewWidthMode === 'fixed' ? `${appStore.previewWidth}px` : 'none'
}))

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
})

// 为标题赋予与大纲解析器（useOutline）一致的顺序锚点 id（heading-0, heading-1, ...），
// 大纲面板点击时通过 document.getElementById 定位滚动
md.core.ruler.push('heading_anchor_ids', (state) => {
  let index = 0
  for (const token of state.tokens) {
    if (token.type === 'heading_open') {
      token.attrSet('id', `heading-${index}`)
      index++
    }
  }
  return true
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
  if (previewRef.value) registerPreview(previewRef.value)
})

onUnmounted(() => {
  unregisterPreview()
})
</script>

<template>
  <div class="preview-wrapper">
    <div ref="previewRef" class="preview-container">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <component :is="'style'">{{ currentCss }}</component>
      <div class="preview-content" :style="contentStyle" v-html="renderedHtml"></div>
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

.preview-container {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
  background: rgba(255, 255, 255, 0.02);
}

.preview-content {
  margin: 0 auto;
  line-height: 1.7;
  color: #d4d4d8;
}

:global(.light) .preview-container {
  background: #ffffff;
}
</style>
