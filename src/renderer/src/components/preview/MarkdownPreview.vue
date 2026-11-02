<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useDocumentsStore } from '../../stores/documents'
import { useAppStore } from '../../stores/app'
import { useStyleStore } from '../../stores/style'
import { useScrollSync } from '../../composables/useScrollSync'
import {
  collectMermaidBlocks,
  formatMermaidError,
  getMermaidLanguage
} from '../../utils/mermaid'
import { parseFrontmatter, renderFrontmatterTable } from '../../utils/frontmatter'
import { saveDiagram, serializeSvg } from '../../utils/diagram-export'
import { installLocalImageRule, resolveImageSrc, resolveLocalPath } from '../../utils/local-image'
import DiagramPreviewModal from './DiagramPreviewModal.vue'
import MarkdownIt from 'markdown-it'

const editorStore = useEditorStore()
const documentsStore = useDocumentsStore()
const appStore = useAppStore()
const styleStore = useStyleStore()
const { suspendSync, registerPreview, unregisterPreview } = useScrollSync()
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

// 相对路径图片按当前文档所在目录解析（通过 markit-file 协议读取本地文件）
installLocalImageRule(md, () => documentsStore.activeDoc?.path)

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
  const { entries, body } = parseFrontmatter(editorStore.content)
  // frontmatter 不再作为 YAML 文本渲染，改为顶部的文档信息表格
  const frontmatter = entries.length > 0 ? renderFrontmatterTable(entries) : ''
  return frontmatter + md.render(body)
})

const EXTERNAL_LINK = /^(?:https?|mailto):/i
const LINK_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
/** Windows 盘符（如 D:\docs\a.md）不是协议 */
const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/

/**
 * 预览区链接点击分流：页内锚点保持浏览器原生跳转；
 * 网络链接交给默认浏览器；本地文件链接在资源管理器中定位，无法定位则不处理。
 * 其余协议（ftp、tel、javascript 等）一律忽略，避免主窗口被导航走。
 */
function handlePreviewLinkClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement)) return

  const href = anchor.getAttribute('href')?.trim()
  if (!href || href.startsWith('#')) return

  event.preventDefault()

  if (EXTERNAL_LINK.test(href)) {
    void window.api.openExternal(href)
    return
  }

  const isFileUrl = /^file:/i.test(href)
  if (!isFileUrl && LINK_SCHEME.test(href) && !WINDOWS_DRIVE_PATH.test(href)) return

  const localPath = resolveLocalPath(href, documentsStore.activeDoc?.path)
  if (localPath) void window.api.showItemInFolder(localPath)
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.25

// 图表弹窗预览
const diagramModalVisible = ref(false)
const diagramPreview = ref({
  svgXml: '',
  width: 800,
  height: 600,
  background: '#ffffff'
})

function openDiagramPreview(svgEl: SVGSVGElement): void {
  const { xml, width, height } = serializeSvg(svgEl)
  diagramPreview.value = {
    svgXml: xml,
    width,
    height,
    background: isDark.value ? '#1e1e24' : '#ffffff'
  }
  diagramModalVisible.value = true
}

/**
 * 包装 mermaid 输出的 SVG：增加缩放 / 预览 / 下载控件。
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

  // mermaid 输出 width="100%" 并带 max-width，放进可滚动的 flex 容器后会被压缩到
  // 容器宽度（甚至塌缩），导致初始尺寸过小、完全看不清。这里固定为 SVG 的原始尺寸，
  // 超出可视区域时由 viewport 滚动查看，缩放仍从 100% 开始。
  const svgEl = canvas.querySelector('svg')
  if (svgEl) {
    const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    const naturalWidth = viewBox?.length === 4 ? viewBox[2] : 0
    const naturalHeight = viewBox?.length === 4 ? viewBox[3] : 0
    if (naturalWidth > 0 && naturalHeight > 0) {
      svgEl.setAttribute('width', String(naturalWidth))
      svgEl.setAttribute('height', String(naturalHeight))
      svgEl.style.width = `${naturalWidth}px`
      svgEl.style.height = `${naturalHeight}px`
    }
    svgEl.style.maxWidth = 'none'
  }

  let scale = 1

  const zoomLabel = document.createElement('button')
  zoomLabel.type = 'button'
  zoomLabel.classList.add('mermaid-toolbar-btn', 'mermaid-zoom-label')
  zoomLabel.title = '恢复原始大小'

  function applyScale(next: number): void {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    canvas.style.setProperty('zoom', String(scale))
    zoomLabel.textContent = `${Math.round(scale * 100)}%`
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
      await saveDiagram(svgEl, extension, background)
    } catch (err) {
      console.error('Failed to export diagram:', err)
    }
  }

  function preview(): void {
    const svgEl = currentSvg()
    if (svgEl) openDiagramPreview(svgEl)
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
    createButton('预览', '弹窗预览（可缩放 / 滚动 / 下载）', preview),
    createButton('SVG', '下载为 SVG', () => void download('svg')),
    createButton('PNG', '下载为 PNG', () => void download('png'))
  )

  // 双击图表快速打开弹窗预览
  viewport.title = '双击放大预览'
  viewport.addEventListener('dblclick', (event) => {
    if (!(event.target as Element | null)?.closest('svg')) return
    event.preventDefault()
    const svgEl = currentSvg()
    if (svgEl) openDiagramPreview(svgEl)
  })

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

/** 兼容 Markdown 内嵌 HTML 的 <img src>：v-html 渲染后统一改写相对路径 */
function resolveHtmlImages(): void {
  const content = previewRef.value?.querySelector('.preview-content')
  if (!content) return
  const docPath = documentsStore.activeDoc?.path
  for (const img of content.querySelectorAll('img')) {
    // 记住原始地址，切换文档（内容相同但目录不同）时可以重新解析
    const rawSrc = img.dataset.markitSrc ?? img.getAttribute('src')
    if (!rawSrc || rawSrc.startsWith('markit-file:')) continue
    img.dataset.markitSrc = rawSrc
    const resolved = resolveImageSrc(rawSrc, docPath)
    if (resolved) img.setAttribute('src', resolved)
  }
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
      resolveHtmlImages()
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

// 文档目录变化（切换标签 / 另存为）时，HTML <img> 需要按新目录重新解析
watch(
  () => documentsStore.activeDoc?.path,
  async () => {
    await nextTick()
    resolveHtmlImages()
  }
)

/** 预览区是共用的滚动容器，必须按标签分别记录位置，否则新文档会沿用上一个文档的偏移 */
function savePreviewScroll(id: string): void {
  const el = previewRef.value
  if (el) documentsStore.setPreviewScrollPosition(id, el.scrollTop)
}

function restorePreviewScroll(id: string): void {
  const el = previewRef.value
  if (!el) return
  // 程序化滚动会触发 scroll 事件，暂时屏蔽与编辑区的同步，
  // 避免把编辑区刚恢复好的位置反向覆盖掉
  suspendSync()
  el.scrollTop = documentsStore.getPreviewScrollPosition(id)
}

watch(
  () => documentsStore.activeId,
  async (newId, oldId) => {
    // 关闭标签同样会改变 activeId，此时旧标签已移除，不必再记录位置
    if (oldId && documentsStore.getDoc(oldId)) savePreviewScroll(oldId)
    if (!newId) return
    await nextTick()
    restorePreviewScroll(newId)
  }
)

onMounted(async () => {
  await scheduleRender()
  if (previewRef.value) {
    registerPreview(previewRef.value)
    restorePreviewScroll(documentsStore.activeId)
  }
})

// 卸载前 DOM 还挂在文档上，只有此时才能读到真实的滚动位置
onBeforeUnmount(() => {
  const id = documentsStore.activeId
  if (id) savePreviewScroll(id)
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
      <div
        class="preview-content"
        :style="contentStyle"
        v-html="renderedHtml"
        @click="handlePreviewLinkClick"
      ></div>
    </div>

    <DiagramPreviewModal
      :visible="diagramModalVisible"
      :svg-xml="diagramPreview.svgXml"
      :width="diagramPreview.width"
      :height="diagramPreview.height"
      :background="diagramPreview.background"
      @close="diagramModalVisible = false"
    />
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
