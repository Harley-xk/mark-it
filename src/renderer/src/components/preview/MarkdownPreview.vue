<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useStyleStore } from '../../stores/style'
import { useScrollSync } from '../../composables/useScrollSync'
import {
  collectMermaidBlocks,
  formatMermaidError,
  getMermaidLanguage
} from '../../utils/mermaid'
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

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.25

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** 序列化 SVG 并补上独立查看所需的尺寸与命名空间 */
function serializeSvg(svgEl: SVGSVGElement): { xml: string; width: number; height: number } {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const viewBox = clone
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number)
  const width = viewBox?.[2] || clone.clientWidth || 800
  const height = viewBox?.[3] || clone.clientHeight || 600

  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', XLINK_NS)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  // mermaid 会给 svg 设置 max-width，单独查看/导出时不需要
  clone.style.maxWidth = ''

  return { xml: new XMLSerializer().serializeToString(clone), width, height }
}

/** 把 SVG 绘制到 2x 画布并编码为 PNG（htmlLabels 已关闭，画布不会被 foreignObject 污染） */
async function svgToPng(svgEl: SVGSVGElement, background: string): Promise<Uint8Array> {
  const { xml, width, height } = serializeSvg(svgEl)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG 图片加载失败'))
      image.src = url
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width * scale))
    canvas.height = Math.max(1, Math.ceil(height * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG 编码失败')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 包装 mermaid 输出的 SVG：增加缩放 / 下载控件。
 * 缩放通过 CSS zoom 实现，容器滚动即可查看超出范围的部分。
 */
function createDiagramView(svgText: string, background: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.classList.add('mermaid-diagram')

  const toolbar = document.createElement('div')
  toolbar.classList.add('mermaid-toolbar')

  const viewport = document.createElement('div')
  viewport.classList.add('mermaid-viewport')

  const canvas = document.createElement('div')
  canvas.classList.add('mermaid-canvas')
  canvas.innerHTML = svgText
  viewport.appendChild(canvas)

  let scale = 1

  const zoomLabel = document.createElement('button')
  zoomLabel.type = 'button'
  zoomLabel.classList.add('mermaid-toolbar-btn', 'mermaid-zoom-label')
  zoomLabel.title = '恢复原始大小'

  function applyScale(next: number): void {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    canvas.style.setProperty('zoom', String(scale))
    zoomLabel.textContent = `${Math.round(scale * 100)}%`
    wrapper.classList.toggle('zoomed', scale > 1)
  }

  function createButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.add('mermaid-toolbar-btn')
    button.textContent = text
    button.title = title
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })
    return button
  }

  function currentSvg(): SVGSVGElement | null {
    return canvas.querySelector('svg')
  }

  async function download(extension: 'svg' | 'png'): Promise<void> {
    const svgEl = currentSvg()
    if (!svgEl) return
    try {
      const fileName = `mermaid-${Date.now()}.${extension}`
      if (extension === 'svg') {
        const { xml } = serializeSvg(svgEl)
        await window.api.saveImage(fileName, new TextEncoder().encode(xml), 'svg')
      } else {
        await window.api.saveImage(fileName, await svgToPng(svgEl, background), 'png')
      }
    } catch (err) {
      console.error('Failed to export diagram:', err)
    }
  }

  zoomLabel.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    applyScale(1)
  })

  toolbar.append(
    createButton('−', '缩小', () => applyScale(scale / ZOOM_STEP)),
    zoomLabel,
    createButton('＋', '放大', () => applyScale(scale * ZOOM_STEP)),
    createButton('SVG', '下载为 SVG', () => void download('svg')),
    createButton('PNG', '下载为 PNG', () => void download('png'))
  )

  // Ctrl/Cmd + 滚轮缩放图表（不触发整窗缩放）
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      applyScale(event.deltaY < 0 ? scale * ZOOM_STEP : scale / ZOOM_STEP)
    },
    { passive: false }
  )

  wrapper.append(toolbar, viewport)
  applyScale(1)
  return wrapper
}

async function renderMermaid(): Promise<void> {
  if (!previewRef.value) return
  const blocks = collectMermaidBlocks(previewRef.value)
  if (blocks.length === 0) return

  try {
    const mermaid = (await import('mermaid')).default
    const theme = appStore.resolvedTheme === 'dark' ? 'dark' : 'default'
    if (!mermaidInitialized || currentMermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'loose',
        // 标签使用 SVG <text> 而非 foreignObject：既能下载为 PNG，导出的 SVG 也更通用
        htmlLabels: false
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
        const background = isDark.value ? '#1e1e24' : '#ffffff'
        parent.replaceWith(createDiagramView(svg, background))
      } catch (err) {
        // 渲染失败时保留原始代码块，仅在下方追加提示，方便直接修改语法
        const notice = document.createElement('div')
        notice.classList.add('mermaid-error')
        const language = getMermaidLanguage(block) ?? 'mermaid'
        notice.textContent = `图表渲染失败（${language}）：${formatMermaidError(err)}`
        notice.title = err instanceof Error ? err.message : String(err)
        parent.insertAdjacentElement('afterend', notice)
      }
    }
  } catch {
    // mermaid not available
  }
}

// 串行化渲染：编辑时预览内容会被反复替换，并发的 mermaid.render 会争用内部状态
let renderToken = 0
let renderChain: Promise<void> = Promise.resolve()

async function scheduleRender(): Promise<void> {
  const token = ++renderToken
  await nextTick()
  renderChain = renderChain
    .then(async () => {
      // 已有更新的内容时丢弃本次（等待中的）渲染
      if (token !== renderToken) return
      await renderMermaid()
    })
    .catch((err) => {
      console.error('Mermaid render failed:', err)
    })
  await renderChain
}

watch(renderedHtml, () => {
  void scheduleRender()
})

onMounted(async () => {
  await scheduleRender()
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
