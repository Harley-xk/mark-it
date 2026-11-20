<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick } from 'vue'
import { useDocumentsStore, type DocumentTab } from '../../stores/documents'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'
import { useStyleStore } from '../../stores/style'
import { useSearchStore } from '../../stores/search'
import { useScrollSync } from '../../composables/useScrollSync'
import { registerScrollCapture } from '../../composables/session-scroll'
import { usePreviewTableResize } from '../../composables/usePreviewTableResize'
import { collectMermaidBlocks, formatMermaidError, getMermaidLanguage } from '../../utils/mermaid'
import {
  buildPeleThemeVariables,
  getDiagramTheme,
  type DiagramThemeTokens
} from '../../utils/diagram-theme'
import {
  renderDiagramSvg,
  type DiagramEngine,
  type DiagramRenderResult
} from '../../utils/diagram-renderer'
import { parseFrontmatter, renderFrontmatterTable } from '../../utils/frontmatter'
import { saveDiagram, serializeSvg } from '../../utils/diagram-export'
import { isRemoteImageSrc, suggestImageFileName } from '../../utils/media-preview'
import {
  installLocalImageRule,
  isMarkdownPath,
  localPathFromImageSrc,
  resolveImageSrc,
  resolveLocalPath
} from '../../utils/local-image'
import { installHeadingAnchors } from '../../utils/headings'
import { installLinkTitles } from '../../utils/link-title'
import { findHeadingAnchorId, splitLinkLocation } from '../../utils/link-target'
import { createMarkdownRenderer } from '../../utils/markdown'
import { sanitizeMarkdownHtml } from '../../utils/sanitize'
import { collectPreviewRanges } from '../../utils/search'
import { LruCache } from '../../utils/lru-cache'
import { confirmUnsaved } from '../../composables/useConfirmUnsaved'
import { useFile } from '../../composables/useFile'
import { takePreviewJump } from '../../composables/link-navigation'
import { useI18n } from '../../i18n'
import type { Locale } from '../../../../shared/locale-types'
import SearchPanel from '../common/SearchPanel.vue'
import type { PreviewWindowPayload } from '../../../../shared/preview-types'

/** 单个标签的预览渲染结果；路径参与校验，因为相对图片在渲染时已解析为绝对地址 */
interface CachedPreviewHtml {
  content: string
  path: string | null
  locale: Locale
  html: string
}

/** 图表缓存条目额外记录渲染时使用的 diagramId，复用时据此替换成新的唯一 id */
interface CachedDiagramSvg extends DiagramRenderResult {
  diagramId: string
}

/**
 * 预览组件在布局切换时会被卸载重挂，缓存放在模块级才能跨实例复用。
 * 容量按「文档数」「图表数」限制，避免长文档的 HTML 字符串无限累积。
 */
const htmlCache = new LruCache<string, CachedPreviewHtml>(6)
const diagramCache = new LruCache<string, CachedDiagramSvg>(32)

/** 正文输入到预览重渲染的合并窗口；切换标签不受此限制 */
const RENDER_DEBOUNCE_MS = 150

const documentsStore = useDocumentsStore()
const editorStore = useEditorStore()
const appStore = useAppStore()
const styleStore = useStyleStore()
const search = useSearchStore()
const file = useFile()
const { locale, t } = useI18n()
const { suspendSync, registerPreview, unregisterPreview } = useScrollSync()
const previewRef = ref<HTMLDivElement>()
const spacerRef = ref<HTMLDivElement>()
const { apply: applyTableWidths } = usePreviewTableResize(() => previewContentEl())
let unregisterScrollCapture: (() => void) | null = null

const isDark = computed(() => appStore.resolvedTheme === 'dark')
const diagramTheme = computed(() => getDiagramTheme(isDark.value))
const currentCss = computed(() => styleStore.currentCss(isDark.value))

/**
 * 大文件默认暂停预览；纯文本模式始终不渲染。
 * 用户显式覆盖按标签记录在本次会话内，不写入会话、不跨重启保留。
 */
const previewPaused = computed(() => {
  const doc = documentsStore.activeDoc
  if (!doc) return false
  if (doc.mode === 'plain') return true
  return doc.mode === 'large' && !doc.previewOverride
})

const pausedTitle = computed(() =>
  documentsStore.activeDoc?.mode === 'plain' ? t('file.mode.plain') : t('file.mode.large')
)

const pausedDescription = computed(() => {
  const doc = documentsStore.activeDoc
  if (!doc) return ''
  if (doc.mode === 'plain') return t('preview.disabledPlain')
  return doc.previewAutoPaused ? t('preview.pausedAfterGrowth') : t('preview.pausedLargeFile')
})

const canRenderAnyway = computed(() => documentsStore.activeDoc?.mode === 'large')

const contentStyle = computed(() => ({
  maxWidth: appStore.previewWidthMode === 'fixed' ? `${appStore.previewWidth}px` : 'none'
}))

const md = createMarkdownRenderer({ typographer: true })

// 相对路径图片按当前文档所在目录解析（通过 markit-file 协议读取本地文件）
installLocalImageRule(md, () => documentsStore.activeDoc?.path)

// 为标题赋予与大纲解析器（useOutline、parseHeadings）一致的顺序锚点 id
// （heading-0, heading-1, ...），大纲面板点击时在当前激活层的 previewContent 内定位
installHeadingAnchors(md)

// 悬停链接时由浏览器原生提示显示完整地址（含自动识别的裸网址）
installLinkTitles(md)

/**
 * 每个访问过的标签保留一个预览层：
 * 层始终挂在滚动容器里，切换标签只切换 transform，不重建 DOM，
 * 因此切回大文档时不会重新解析 HTML、也不会重新布局整篇内容。
 * 不用 visibility：它是继承属性，切换会触发整棵子树（上万节点）的样式重算。
 */
interface PreviewLayer {
  docId: string
  /** 绝对定位的外层，负责内边距与整体高度 */
  element: HTMLElement
  /** 渲染 HTML 的容器；表格列宽、搜索范围都以它为根 */
  content: HTMLElement
  /** 当前 DOM 对应的正文 */
  source: string
  /** 渲染时的文档路径（相对图片已按此解析） */
  path: string | null
  /** 渲染时的界面语言（frontmatter 表格等静态文案据此生成） */
  locale: Locale
  /** 图表按哪一版主题渲染；与当前主题不同才需要重绘 */
  themeRevision: number
  /** 最近一次激活的序号，用于淘汰最久未使用的层 */
  touchedAt: number
}

/** 同时保留的预览层数量：兼顾切换命中率与常驻 DOM 的内存占用 */
const MAX_PREVIEW_LAYERS = 3

const layers = new Map<string, PreviewLayer>()
let activeLayer: PreviewLayer | null = null
let layerTouchSeq = 0
let layerResizeObserver: ResizeObserver | null = null
/** 主题 / 预览样式的版本号：变化后需要按新主题重绘图表 */
let themeRevision = 0

function previewContentEl(): HTMLElement | null {
  return activeLayer?.content ?? null
}

/** 取该标签的预览 HTML：内容与路径都没变时直接复用上次渲染结果 */
function previewHtmlFor(doc: DocumentTab): string {
  const cached = htmlCache.get(doc.id)
  if (
    cached &&
    cached.content === doc.content &&
    cached.path === doc.path &&
    cached.locale === locale.value
  ) {
    return cached.html
  }

  const { entries, body } = parseFrontmatter(doc.content)
  // frontmatter 不再作为 YAML 文本渲染，改为顶部的文档信息表格
  const frontmatter = entries.length > 0 ? renderFrontmatterTable(entries, locale.value) : ''
  // 文档内容可能来自不受信任的来源：进入 preview 层与缓存前统一清洗
  const html = sanitizeMarkdownHtml(frontmatter + md.render(body))
  htmlCache.set(doc.id, { content: doc.content, path: doc.path, locale: locale.value, html })
  return html
}

function fillLayer(layer: PreviewLayer, doc: DocumentTab): void {
  layer.content.innerHTML = previewHtmlFor(doc)
  layer.source = doc.content
  layer.path = doc.path
  layer.locale = locale.value
}

function createLayer(doc: DocumentTab): PreviewLayer | null {
  const container = previewRef.value
  if (!container) return null
  const element = document.createElement('div')
  element.className = 'markit-preview-layer'
  const content = document.createElement('div')
  content.className = 'preview-content markdown-body'
  content.style.maxWidth = contentStyle.value.maxWidth
  // 可编程聚焦：隐藏层里的链接获得焦点时把焦点拉回当前层
  content.tabIndex = -1
  element.appendChild(content)
  container.appendChild(element)

  const layer: PreviewLayer = {
    docId: doc.id,
    element,
    content,
    source: '',
    path: null,
    locale: locale.value,
    themeRevision: -1,
    touchedAt: 0
  }
  // 先隐藏，等确认它成为激活层后再移回视口，避免切换瞬间新层闪一下
  hideLayer(layer)
  fillLayer(layer, doc)
  layers.set(doc.id, layer)
  return layer
}

/**
 * 隐藏非激活层：移出视口而不是改 visibility。
 * transform 不影响后代元素的样式，切换时不会触发整棵子树重算。
 * 注意不要用 inert / visibility：它们会让 Chromium 重算整层（上万个元素）的样式。
 * 隐藏层里仍可聚焦的链接由 onPreviewFocusIn 拉回当前层。
 */
function hideLayer(layer: PreviewLayer): void {
  layer.element.style.transform = 'translateX(-200%)'
  layer.element.setAttribute('aria-hidden', 'true')
}

function showLayer(layer: PreviewLayer): void {
  layer.element.style.transform = ''
  layer.element.removeAttribute('aria-hidden')
}

/**
 * 焦点落进非激活层时（隐藏层里的链接仍可被 Tab 命中），
 * 立即拉回当前层，避免浏览器把视口滚到屏幕外的内容。
 */
function onPreviewFocusIn(event: FocusEvent): void {
  if (!activeLayer) return
  const target = event.target
  if (!(target instanceof Node) || activeLayer.element.contains(target)) return
  activeLayer.content.focus({ preventScroll: true })
  const container = previewRef.value
  if (container) container.scrollLeft = 0
}

/** 滚动容器的高度由占位元素提供（层是绝对定位，不参与流式布局） */
function updateSpacer(): void {
  const spacer = spacerRef.value
  if (!spacer) return
  spacer.style.height = activeLayer ? `${activeLayer.element.offsetHeight}px` : '0px'
}

/** 图片、图表、字体加载完成后层高会变化，用观察器同步占位元素 */
function observeActiveLayer(): void {
  if (typeof ResizeObserver === 'undefined') return
  layerResizeObserver ??= new ResizeObserver(() => updateSpacer())
  layerResizeObserver.disconnect()
  if (activeLayer) layerResizeObserver.observe(activeLayer.element)
}

/** 清理已关闭标签的层，并按最近使用淘汰超出上限的层 */
function pruneLayers(): void {
  const liveIds = new Set(documentsStore.docs.map((doc) => doc.id))
  for (const [id, layer] of layers) {
    if (layer === activeLayer || liveIds.has(id)) continue
    layer.element.remove()
    layers.delete(id)
  }

  while (layers.size > MAX_PREVIEW_LAYERS) {
    let victim: PreviewLayer | null = null
    for (const layer of layers.values()) {
      if (layer === activeLayer) continue
      if (!victim || layer.touchedAt < victim.touchedAt) victim = layer
    }
    if (!victim) break
    victim.element.remove()
    layers.delete(victim.docId)
  }
}

/** 暂停预览：隐藏现有层并清空预览内容登记，保留缓存层供恢复时复用 */
function hidePreviewLayers(): void {
  cancelPendingRender()
  if (activeLayer) {
    hideLayer(activeLayer)
    activeLayer = null
  }
  editorStore.setPreviewContent(null)
  updateSpacer()
}

/** 把激活文档切到它自己的预览层；返回是否重建了该层的 DOM */
function applyActiveLayer(): boolean {
  cancelPendingRender()

  if (previewPaused.value) {
    hidePreviewLayers()
    return false
  }

  const doc = documentsStore.activeDoc
  if (!doc || !previewRef.value) {
    if (activeLayer) {
      hideLayer(activeLayer)
      activeLayer = null
    }
    editorStore.setPreviewContent(null)
    updateSpacer()
    return false
  }

  let layer: PreviewLayer | null | undefined = layers.get(doc.id)
  let rebuilt = false
  if (!layer) {
    layer = createLayer(doc)
    rebuilt = true
  } else if (
    layer.source !== doc.content ||
    layer.path !== doc.path ||
    layer.locale !== locale.value
  ) {
    fillLayer(layer, doc)
    rebuilt = true
  }
  if (!layer) return false

  if (layer !== activeLayer) {
    if (activeLayer) hideLayer(activeLayer)
    showLayer(layer)
    activeLayer = layer
    editorStore.setPreviewContent(layer.content)
    observeActiveLayer()
  }

  layer.touchedAt = ++layerTouchSeq
  updateSpacer()
  pruneLayers()
  return rebuilt
}

let pendingRenderTimer: ReturnType<typeof setTimeout> | null = null

function cancelPendingRender(): void {
  if (pendingRenderTimer === null) return
  clearTimeout(pendingRenderTimer)
  pendingRenderTimer = null
}

/** 正文变化后合并渲染，避免每个字符都整篇重算；预览暂停时直接跳过 */
function scheduleDocumentRender(): void {
  cancelPendingRender()
  if (previewPaused.value) return
  pendingRenderTimer = setTimeout(() => {
    pendingRenderTimer = null
    if (applyActiveLayer()) void schedulePostRender()
  }, RENDER_DEBOUNCE_MS)
}

watch(() => documentsStore.activeDoc?.content, scheduleDocumentRender)

/** 模式 / 手动覆盖变化：暂停时隐藏预览，恢复时按缓存重建并重新渲染 */
watch(previewPaused, async (paused) => {
  if (paused) {
    hidePreviewLayers()
    clearPreviewSearch()
    // 预览关闭后不再有可搜索的渲染结果，避免计数停留在暂停前的值
    if (search.surface === 'preview') search.updateResult(0, true)
    return
  }
  const rebuilt = applyActiveLayer()
  if (rebuilt) await schedulePostRender()
  else {
    applyPreviewSearch(false)
    updateSpacer()
  }
})

/** 大文件模式下用户明确要求渲染预览：先提示预计耗时 */
async function renderAnyway(): Promise<void> {
  const doc = documentsStore.activeDoc
  if (!doc) return
  const action = await confirmUnsaved(
    t('preview.renderAnywayConfirmTitle'),
    t('preview.renderAnywayConfirm', { name: doc.name }),
    { save: t('preview.renderAnyway') },
    true,
    { hideDiscard: true, cancelText: t('common.cancel') }
  )
  if (action === 'save') documentsStore.setPreviewOverride(doc.id, true)
}

// 关闭标签（含批量关闭其他标签）后及时释放对应的预览层
watch(() => documentsStore.docs.length, pruneLayers)

// 预览宽度变化时同步到所有保留的层
watch(contentStyle, (style) => {
  for (const layer of layers.values()) layer.content.style.maxWidth = style.maxWidth
})

const EXTERNAL_LINK = /^(?:https?|mailto):/i
const LINK_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
/** Windows 盘符（如 D:\docs\a.md）不是协议 */
const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/

/**
 * 页内锚点在当前预览层内解析。
 * 多个标签的预览层会同时带有 heading-N 等 id，原生 #id 跳转可能命中隐藏层。
 * 显式 id 优先；匹配不到时按 GitHub slug / 标题原文查找标题锚点。
 */
function scrollToPreviewAnchor(rawId: string): void {
  const id = decodeURIComponent(rawId)
  if (!id) {
    previewRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const content = previewContentEl()
  const direct = content?.querySelector(`#${CSS.escape(id)}`)
  if (direct) {
    direct.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  const source = documentsStore.activeDoc?.content
  const headingId = source ? findHeadingAnchorId(source, id) : null
  if (!headingId) return
  content?.querySelector(`#${CSS.escape(headingId)}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}

/**
 * 预览区链接点击分流：页内锚点在当前预览层内跳转；
 * 网络链接交给默认浏览器；本地链接按修饰键分流——Ctrl/Cmd + 单击 Markdown 链接
 * 以浏览器后台标签方式打开，其余本地文件交给系统默认程序，不按修饰键时在资源管理器中定位。
 * 其余协议（ftp、tel、javascript 等）一律忽略，避免编辑窗口被导航走。
 */
function handlePreviewLinkClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (!(event.target instanceof Element)) return

  const anchor = event.target.closest('a')
  if (anchor instanceof HTMLAnchorElement) {
    const href = anchor.getAttribute('href')?.trim()
    if (!href) return

    if (href.startsWith('#')) {
      event.preventDefault()
      scrollToPreviewAnchor(href.slice(1))
      return
    }

    event.preventDefault()

    if (EXTERNAL_LINK.test(href)) {
      void window.api.openExternal(href)
      return
    }

    const isFileUrl = /^file:/i.test(href)
    if (!isFileUrl && LINK_SCHEME.test(href) && !WINDOWS_DRIVE_PATH.test(href)) return

    // 行号后缀与片段不属于文件路径：拆分后按真实路径定位，定位信息留给打开逻辑
    const location = splitLinkLocation(href)
    const localPath = resolveLocalPath(location.href, documentsStore.activeDoc?.path)
    if (!localPath) return

    if (event.ctrlKey || event.metaKey) {
      // 类似浏览器后台标签：Markdown 入列但不切换；其它本地文件交给系统默认程序
      if (isMarkdownPath(localPath)) void file.openLinkedDocument(localPath, location)
      else void window.api.openPath(localPath)
      return
    }

    void window.api.showItemInFolder(localPath)
    return
  }

  // 链接优先；没有链接时单击图片打开大图预览
  const image = event.target.closest('img')
  if (image instanceof HTMLImageElement) {
    event.preventDefault()
    void openImagePreview(image)
  }
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.25
/** 自动适应容器时允许的最小缩放：再小会影响阅读，此时保留滚动条查看 */
const MIN_FIT_SCALE = 0.6
/** 适应尺寸时预留的余量，避免取整误差让刚好放得下的图表又冒出滚动条 */
const FIT_GUTTER = 4

// 容器尺寸变化（窗口缩放、侧栏折叠、预览宽度切换）时重新适应图表尺寸
const fitCallbacks = new Map<Element, () => void>()
let fitObserver: ResizeObserver | null = null

function observeViewportSize(el: Element, onResize: () => void): void {
  if (typeof ResizeObserver === 'undefined') return
  if (!fitObserver) {
    fitObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.isConnected) fitCallbacks.get(entry.target)?.()
      }
    })
  }
  fitCallbacks.set(el, onResize)
  fitObserver.observe(el)
}

/** 预览内容每次重渲染都会替换掉旧图表，先释放上一批观察器 */
function clearViewportObservers(): void {
  fitObserver?.disconnect()
  fitCallbacks.clear()
}

// 图表 / 图片独立预览窗口
function currentPreviewTheme(): 'light' | 'dark' {
  return isDark.value ? 'dark' : 'light'
}

function openDiagramPreview(svgEl: SVGSVGElement): void {
  const { xml, width, height } = serializeSvg(svgEl)
  const payload: PreviewWindowPayload = {
    theme: currentPreviewTheme(),
    media: {
      kind: 'diagram',
      svgXml: xml,
      width,
      height,
      background: diagramTheme.value.background
    }
  }
  void window.api.preview.open(payload)
}

/** blob URL 只在创建它的渲染进程内有效，预览窗口需要先转成 data URL */
function blobUrlToDataUrl(src: string): Promise<string> {
  return fetch(src)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
    )
}

/** 单击预览中的图片打开独立预览窗口；链接内的图片已在前面的链接分支处理 */
async function openImagePreview(img: HTMLImageElement): Promise<void> {
  if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return
  let src = img.getAttribute('src') || img.currentSrc || ''
  if (!src) return

  if (src.startsWith('blob:')) {
    try {
      src = await blobUrlToDataUrl(src)
    } catch (err) {
      console.error('Failed to read blob image for preview:', err)
      return
    }
  }

  const fallbackName = img.alt.trim() || `image-${Date.now()}`
  const payload: PreviewWindowPayload = {
    theme: currentPreviewTheme(),
    media: {
      kind: 'image',
      src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      background: diagramTheme.value.background,
      fileName: suggestImageFileName(src, fallbackName),
      localPath: localPathFromImageSrc(src),
      remote: isRemoteImageSrc(src)
    }
  }
  void window.api.preview.open(payload)
}

/**
 * 包装 mermaid 输出的 SVG：增加缩放 / 预览 / 下载控件。
 * 缩放通过 CSS zoom 实现，容器滚动即可查看超出范围的部分。
 */
function createDiagramView(
  svgText: string,
  source: string,
  language: string,
  theme: DiagramThemeTokens,
  fontFamily: string,
  engine: DiagramEngine
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.classList.add('mermaid-diagram')
  wrapper.dataset.diagramEngine = engine
  wrapper.dataset.diagramSource = source
  wrapper.dataset.diagramLanguage = language
  wrapper.style.background = theme.background

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
  // 再由 autoFit 按容器大小缩小，只有缩放后仍然过大时才出现滚动条。
  let naturalWidth = 0
  let naturalHeight = 0
  const svgEl = canvas.querySelector('svg')
  if (svgEl) {
    // Pele 通过 CSS 变量换肤；变量写到 SVG 根节点，下载 SVG / PNG 时颜色才不会丢失
    for (const [name, value] of Object.entries(buildPeleThemeVariables(theme, fontFamily))) {
      svgEl.style.setProperty(name, value)
    }
    const viewBox = svgEl
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number)
    naturalWidth = viewBox?.length === 4 ? viewBox[2] : 0
    naturalHeight = viewBox?.length === 4 ? viewBox[3] : 0
    if (naturalWidth > 0 && naturalHeight > 0) {
      svgEl.setAttribute('width', String(naturalWidth))
      svgEl.setAttribute('height', String(naturalHeight))
      svgEl.style.width = `${naturalWidth}px`
      svgEl.style.height = `${naturalHeight}px`
    }
    svgEl.style.maxWidth = 'none'
  }

  let scale = 1
  /** 用户手动缩放后不再自动适应，避免调整窗口时覆盖用户的选择 */
  let autoFit = true

  const zoomLabel = document.createElement('button')
  zoomLabel.type = 'button'
  zoomLabel.classList.add('mermaid-toolbar-btn', 'mermaid-zoom-label')
  zoomLabel.title = t('preview.restoreSize')

  function applyScale(next: number): void {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    canvas.style.setProperty('zoom', String(scale))
    zoomLabel.textContent = `${Math.round(scale * 100)}%`
  }

  /** 完整放入视口宽度所需的缩放比例；只缩小不放大 */
  function fitScale(): number {
    if (naturalWidth <= 0 || naturalHeight <= 0) return 1
    const availableWidth = viewport.clientWidth - FIT_GUTTER
    if (availableWidth <= 0) return 1
    return Math.min(1, availableWidth / naturalWidth)
  }

  /**
   * 自动适应视口：略微溢出时缩小到能完整展示；需要缩得太小（影响阅读）时
   * 停在 MIN_FIT_SCALE，保留下来的超出部分由滚动条查看。
   */
  function fitToViewport(): void {
    // 图表尚未挂载或预览区被隐藏时测不到尺寸，交给后续的尺寸观察回调
    if (!viewport.isConnected || viewport.clientWidth <= 0) return
    applyScale(Math.max(MIN_FIT_SCALE, fitScale()))
  }

  /** 手动缩放：退出自动适应模式 */
  function zoomBy(factor: number): void {
    autoFit = false
    applyScale(scale * factor)
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
      // 鼠标点击后释放焦点，避免 :focus-within 让工具栏在鼠标移出后继续显示；
      // 键盘触发的 click（detail === 0）保留焦点，保证键盘操作时工具栏可见
      if (event.detail > 0) button.blur()
    })
    return button
  }

  // 图标按钮：createButton 用 textContent 填充，无法承载 SVG，这里单独走 innerHTML
  function createIconButton(
    svgMarkup: string,
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.add('mermaid-toolbar-btn', 'mermaid-icon-btn')
    button.innerHTML = svgMarkup
    button.title = title
    button.setAttribute('aria-label', title)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
      if (event.detail > 0) button.blur()
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
      await saveDiagram(svgEl, extension, theme.background)
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
    autoFit = false
    applyScale(1)
    if (event.detail > 0) zoomLabel.blur()
  })

  toolbar.append(
    createButton('−', t('preview.zoomOut'), () => zoomBy(1 / ZOOM_STEP)),
    zoomLabel,
    createButton('＋', t('preview.zoomIn'), () => zoomBy(ZOOM_STEP)),
    createIconButton(
      `<svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>`,
      t('preview.previewModal'),
      preview
    ),
    createButton('SVG', t('preview.downloadSvg'), () => void download('svg')),
    createButton('PNG', t('preview.downloadPng'), () => void download('png'))
  )

  // Ctrl/Cmd + 滚轮缩放图表（不触发整窗缩放）
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    },
    { passive: false }
  )

  wrapper.append(toolbar, viewport)
  applyScale(1)

  // 图表插入文档后才有真实尺寸，ResizeObserver 的首轮回调会完成第一次适应；
  // 之后容器尺寸变化（窗口、侧栏、预览宽度）也会重新计算。
  observeViewportSize(viewport, () => {
    if (autoFit) fitToViewport()
  })

  return wrapper
}

/** 兼容 Markdown 内嵌 HTML 的 <img src>：渲染后统一改写相对路径 */
function resolveHtmlImages(): void {
  const content = previewContentEl()
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

function randomDiagramId(): string {
  return `mermaid-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 按「主题 + 字体 + 源码」复用图表 SVG。
 * 复用时为 SVG 换一个新的 diagramId，避免同一文档里出现重复的 DOM id。
 */
async function renderDiagramCached(
  source: string,
  theme: DiagramThemeTokens,
  fontFamily: string
): Promise<DiagramRenderResult> {
  const key = `${isDark.value ? 'dark' : 'light'}|${fontFamily}|${source}`
  const cached = diagramCache.get(key)
  const diagramId = randomDiagramId()
  if (cached) {
    return {
      svg: cached.svg.split(cached.diagramId).join(diagramId),
      engine: cached.engine,
      diagramType: cached.diagramType
    }
  }

  const result = await renderDiagramSvg(source, { diagramId, theme, fontFamily, fontSize: 16 })
  diagramCache.set(key, { ...result, diagramId })
  return result
}

async function renderDiagrams(): Promise<void> {
  const content = previewContentEl()
  if (!content) return
  // 旧图表会随预览内容一起被替换，先停止观察它们
  clearViewportObservers()

  const theme = diagramTheme.value
  const fontFamily = getComputedStyle(content).fontFamily

  // 主题切换时代码块已被替换成图表，需要按保存的源码重绘现有图表
  const rendered = content.querySelectorAll<HTMLElement>('.mermaid-diagram[data-diagram-source]')
  for (const wrapper of rendered) {
    const source = wrapper.dataset.diagramSource ?? ''
    const language = wrapper.dataset.diagramLanguage ?? 'mermaid'
    try {
      const result = await renderDiagramCached(source, theme, fontFamily)
      wrapper.replaceWith(
        createDiagramView(result.svg, source, language, theme, fontFamily, result.engine)
      )
    } catch (err) {
      const notice = document.createElement('div')
      notice.classList.add('mermaid-error')
      notice.textContent = t('preview.diagramRerenderFailed', {
        language,
        reason: formatMermaidError(err, locale.value)
      })
      notice.title = err instanceof Error ? err.message : String(err)
      wrapper.insertAdjacentElement('afterend', notice)
    }
  }

  const blocks = collectMermaidBlocks(content)
  if (blocks.length === 0) return

  for (const block of blocks) {
    const parent = block.parentElement
    if (!parent || parent.tagName !== 'PRE') continue

    const code = block.textContent || ''
    const language = getMermaidLanguage(block) ?? 'mermaid'
    try {
      const result = await renderDiagramCached(code, theme, fontFamily)
      parent.replaceWith(
        createDiagramView(result.svg, code, language, theme, fontFamily, result.engine)
      )
    } catch (err) {
      // 渲染失败时保留原始代码块，仅在下方追加提示，方便直接修改语法
      const notice = document.createElement('div')
      notice.classList.add('mermaid-error')
      notice.textContent = t('preview.diagramRenderFailed', {
        language,
        reason: formatMermaidError(err, locale.value)
      })
      notice.title = err instanceof Error ? err.message : String(err)
      parent.insertAdjacentElement('afterend', notice)
    }
  }
}

// 串行化渲染：编辑时预览内容会被反复替换，并发的 mermaid.render 会争用内部状态
let renderToken = 0
let renderChain: Promise<void> = Promise.resolve()

/**
 * DOM 稳定后的收尾：图片、表格列宽、图表、搜索范围。
 * 调用方拿到的 promise 一定等到「链尾」——即本轮所有更新的渲染都结束，
 * 切换标签的滚动恢复据此判断可以对齐。
 */
async function schedulePostRender(): Promise<void> {
  const token = ++renderToken
  const revision = themeRevision
  await nextTick()
  renderChain = renderChain
    .then(async () => {
      // 已有更新的内容时丢弃本次（等待中的）渲染
      if (token !== renderToken) return
      resolveHtmlImages()
      applyTableWidths()
      await renderDiagrams()
      // 记录该层图表所依据的主题版本，切回时据此判断是否需要重绘
      if (activeLayer) activeLayer.themeRevision = revision
      // Mermaid / 图片 / 表格列宽渲染完成后 DOM 已稳定，重新收集搜索范围
      applyPreviewSearch(false)
      // 图表与图片可能改变层高，同步滚动容器的占位高度
      updateSpacer()
    })
    .catch((err) => {
      console.error('Diagram render failed:', err)
    })

  // 等待期间可能又有新的渲染入链：继续等链尾，确保调用方看到的是最终结果
  let waited: Promise<void>
  do {
    waited = renderChain
    await waited
  } while (waited !== renderChain)
}

// 主题或预览样式变化后，图表颜色与测量尺寸都可能变化，需要按当前主题重新渲染
watch([isDark, currentCss], () => {
  themeRevision += 1
  void schedulePostRender()
})

// 界面语言变化：frontmatter 表格与图表工具栏文案需要重建，缓存也要按语言失效
watch(locale, () => {
  htmlCache.clear()
  if (applyActiveLayer()) void schedulePostRender()
})

// 文档目录变化时，HTML <img> 需要按新目录重新解析。
// 切换标签也会改变路径，但目标层的图片在渲染时已按该路径解析过；
// 只有同一标签另存为（层里的路径已过期）才需要重新处理。
watch(
  () => documentsStore.activeDoc?.path,
  async () => {
    const layer = activeLayer
    if (!layer || layer.docId !== documentsStore.activeId) return
    if (layer.path === documentsStore.activeDoc?.path) return
    await nextTick()
    resolveHtmlImages()
    // 文档路径变化后列宽存档的键随之改变，需要按新文档重新匹配
    applyTableWidths()
  }
)

/** 等待下一帧渲染完成（scroll 事件在帧内派发，用于延后解除联动屏蔽） */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

// ── 搜索高亮（CSS Custom Highlight API） ──

/** 当前匹配的 Range，顺序与搜索计数一致 */
let searchRanges: Range[] = []
/** 本实例注册的高亮对象：布局切换时新旧实例短暂共存，只能清理自己注册的项 */
let registeredAll: Highlight | null = null
let registeredActive: Highlight | null = null
/** 卸载后仍可能有已排队的异步渲染回调，需要主动丢弃 */
let previewUnmounted = false

function clearPreviewSearch(): void {
  searchRanges = []
  if (registeredAll && CSS.highlights.get('markit-search') === registeredAll) {
    CSS.highlights.delete('markit-search')
  }
  if (registeredActive && CSS.highlights.get('markit-search-active') === registeredActive) {
    CSS.highlights.delete('markit-search-active')
  }
  registeredAll = null
  registeredActive = null
}

function updatePreviewHighlights(): void {
  if (searchRanges.length === 0) {
    clearPreviewSearch()
    return
  }

  // 只注册 Range，不修改 v-html 生成的 DOM，渲染与表格列宽 / Mermaid 替换互不干扰
  registeredAll = new Highlight(...searchRanges)
  CSS.highlights.set('markit-search', registeredAll)

  const active = search.index >= 0 ? searchRanges[search.index] : undefined
  registeredActive = active ? new Highlight(active) : null
  if (registeredActive) CSS.highlights.set('markit-search-active', registeredActive)
  else CSS.highlights.delete('markit-search-active')
}

/** 仅预览上下文下把当前匹配滚动到预览容器中部 */
function scrollToPreviewMatch(): void {
  if (previewUnmounted) return
  const container = previewRef.value
  const range = searchRanges[search.index]
  if (!container || !range) return

  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  const box = container.getBoundingClientRect()
  container.scrollTop += rect.top - box.top - box.height / 2 + rect.height / 2
}

/**
 * 重新收集预览区的匹配范围。
 * reset 为 true（查询变化 / 面板打开）时，仅预览上下文回到首项并滚动。
 */
function applyPreviewSearch(reset: boolean): void {
  if (previewUnmounted) return

  const root = previewContentEl()
  // 挂载 / 卸载过渡期间容器可能还不在 DOM 上：跳过本次，等渲染完成后再收集，
  // 不能在这里把计数清零，否则旧实例的排队回调会覆盖新实例的结果
  if (!root) return

  if (!search.isOpen || search.query.length === 0) {
    clearPreviewSearch()
    if (search.surface === 'preview') search.updateResult(0, reset)
    return
  }

  searchRanges = collectPreviewRanges(root, search.query, search.caseSensitive)
  if (search.surface === 'preview') search.updateResult(searchRanges.length, reset)
  updatePreviewHighlights()
  if (reset && search.surface === 'preview') scrollToPreviewMatch()
}

// 查询 / 大小写 / 面板开关 / 搜索上下文变化：等 DOM 稳定后重新标注
watch(
  [() => search.isOpen, () => search.query, () => search.caseSensitive, () => search.surface],
  async () => {
    await nextTick()
    if (previewUnmounted) return
    applyPreviewSearch(true)
  }
)

// 用户主动导航：更新当前项高亮，仅预览上下文跟随滚动
watch(
  () => search.navToken,
  () => {
    if (previewUnmounted || !search.isOpen) return
    updatePreviewHighlights()
    if (search.surface === 'preview') scrollToPreviewMatch()
  }
)

/** 元素顶端相对滚动容器内容原点的像素位置 */
function topWithin(node: HTMLElement, container: HTMLElement): number {
  return (
    node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  )
}

/** 找到视口顶部所在的顶层渲染元素，返回其下标与相对顶端的偏移 */
function findPreviewAnchor(
  content: HTMLElement,
  container: HTMLElement
): { anchor: number; offset: number } {
  const children = content.children
  if (children.length === 0) return { anchor: 0, offset: 0 }
  const viewportTop = container.getBoundingClientRect().top
  let index = -1
  for (let i = 0; i < children.length; i++) {
    if (children[i].getBoundingClientRect().bottom > viewportTop) {
      index = i
      break
    }
  }
  if (index === -1) index = children.length - 1
  const node = children[index] as HTMLElement
  return { anchor: index, offset: container.scrollTop - topWithin(node, container) }
}

/**
 * 预览区是共用的滚动容器，必须按标签分别记录位置。
 * 只存像素不够：切换标签后 Mermaid / 图片 / 表格列宽会重新异步渲染，
 * 高度变化会让同一像素值落到不同内容上，来回切换越滚越偏。
 * 因此以"视口顶部所在的渲染块 + 块内偏移"作为锚点。
 */
function savePreviewScroll(id: string): void {
  const el = previewRef.value
  const content = previewContentEl()
  if (!el || !content) return
  const { anchor, offset } = findPreviewAnchor(content, el)
  documentsStore.setPreviewScrollPosition(id, { top: el.scrollTop, anchor, offset })
}

/**
 * 按内容锚点恢复预览滚动位置。
 * 只负责写入，屏蔽联动由调用方在包含异步渲染的整个恢复窗口内持有。
 */
function restorePreviewScroll(id: string): void {
  const el = previewRef.value
  if (!el) return
  const saved = documentsStore.getPreviewScrollPosition(id)
  const children = previewContentEl()?.children
  if (saved.anchor >= 0 && children && children.length > 0) {
    const node = children[Math.min(saved.anchor, children.length - 1)] as HTMLElement
    el.scrollTop = topWithin(node, el) + saved.offset
  } else {
    // 旧会话没有锚点，或内容尚未渲染出块级元素：退回像素位置
    el.scrollTop = saved.top
  }
}

/**
 * 链接打开时登记的待定位目标：显式 id 优先，其次标题锚点，
 * 都没有对应元素时回到文档顶部。必须在内容渲染与滚动恢复之后调用，避免被覆盖。
 */
function applyPendingPreviewJump(docId: string): void {
  const jump = takePreviewJump(docId)
  if (!jump) return
  // 行号由编辑区负责精确滚动，滚动联动会自然带动预览；仅预览布局才按最近标题近似定位
  if (jump.kind === 'line' && editorStore.editorView) return
  const container = previewRef.value
  if (!container) return
  const content = previewContentEl()
  for (const id of [jump.anchorId, jump.headingId]) {
    if (!id) continue
    const target = content?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (target) {
      container.scrollTop = topWithin(target, container)
      return
    }
  }
  container.scrollTop = 0
}

watch(
  () => documentsStore.activeId,
  async (newId, oldId) => {
    // 关闭标签同样会改变 activeId，此时旧标签已移除，不必再记录位置
    if (oldId && documentsStore.getDoc(oldId)) savePreviewScroll(oldId)

    // 切换到该标签自己的预览层：已渲染过的标签只切换显示状态，
    // 同时取消正文输入遗留的防抖任务，避免旧内容覆盖新标签
    const rebuilt = applyActiveLayer()
    if (!newId || previewPaused.value) return

    // 预览内容切换后会重新异步渲染（Mermaid、图片、表格列宽），高度在渲染
    // 前后不同。整个恢复窗口都必须屏蔽滚动联动：先按缓存恢复一次避免看到
    // 顶部闪动，渲染完成高度稳定后再对齐一次，保证来回切标签不会累积偏移。
    const releaseSync = suspendSync()
    try {
      await nextTick()
      restorePreviewScroll(newId)
      // 命中已渲染的层时不再重跑图片 / 表格 / 图表收尾：
      // 它们已按该标签的路径与主题处理过，重复执行反而会触发整棵子树样式重算
      if (rebuilt || (activeLayer && activeLayer.themeRevision !== themeRevision)) {
        await schedulePostRender()
      } else {
        applyPreviewSearch(false)
        updateSpacer()
      }
      restorePreviewScroll(newId)
      // 程序化写入 scrollTop 触发的 scroll 事件在下一帧才派发；
      // 多等两帧再释放，避免恢复动作本身触发一次跨区联动
      await nextFrame()
      await nextFrame()
    } finally {
      releaseSync()
    }

    // 链接的定位目标最后应用：编辑区行号跳转会触发比例联动，
    // 在恢复窗口内应用会被联动改写；这里单独屏蔽两帧保证锚点精确落位
    const releaseJump = suspendSync()
    applyPendingPreviewJump(newId)
    requestAnimationFrame(() => requestAnimationFrame(releaseJump))
  }
)

onMounted(async () => {
  applyActiveLayer()
  if (!previewPaused.value) await schedulePostRender()
  if (previewRef.value) {
    registerPreview(previewRef.value)
    // 写会话前把活跃标签的实时预览滚动位置刷回 store
    unregisterScrollCapture = registerScrollCapture(savePreviewScroll)
    // 挂载时同样会写滚动位置：与编辑区恢复的先后顺序不固定，先屏蔽联动
    const releaseSync = suspendSync()
    restorePreviewScroll(documentsStore.activeId)
    requestAnimationFrame(() => requestAnimationFrame(releaseSync))
  }
})

// 卸载前 DOM 还挂在文档上，只有此时才能读到真实的滚动位置
onBeforeUnmount(() => {
  const id = documentsStore.activeId
  if (id) savePreviewScroll(id)
  clearViewportObservers()
})

onUnmounted(() => {
  previewUnmounted = true
  cancelPendingRender()
  editorStore.setPreviewContent(null)
  layerResizeObserver?.disconnect()
  layerResizeObserver = null
  unregisterScrollCapture?.()
  unregisterScrollCapture = null
  unregisterPreview()
  clearPreviewSearch()
})
</script>

<template>
  <div class="preview-wrapper">
    <div
      ref="previewRef"
      class="preview-container"
      @click="handlePreviewLinkClick"
      @focusin="onPreviewFocusIn"
    >
      <component :is="'style'">{{ currentCss }}</component>
      <div ref="spacerRef" class="preview-spacer"></div>
    </div>

    <div v-if="previewPaused" class="preview-paused">
      <div class="preview-paused-card">
        <div class="preview-paused-badge">{{ pausedTitle }}</div>
        <p class="preview-paused-text">{{ pausedDescription }}</p>
        <button
          v-if="canRenderAnyway"
          type="button"
          class="preview-paused-action"
          @click="renderAnyway"
        >
          {{ t('preview.renderAnyway') }}
        </button>
      </div>
    </div>

    <SearchPanel v-if="search.isOpen && search.surface === 'preview'" />
  </div>
</template>

<style scoped>
.preview-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-container {
  position: relative;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.02);
}

/* 绝对定位的预览层不参与流式布局，由这个占位元素撑起滚动高度 */
.preview-spacer {
  width: 1px;
}

/* 单击图片可打开大图预览；链接内的图片保持链接光标 */
:deep(.preview-content img:not(a > img)) {
  cursor: zoom-in;
}

/* ── 预览暂停占位（大文件 / 纯文本模式） ── */
.preview-paused {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(18, 18, 24, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.preview-paused-card {
  max-width: 420px;
  padding: 22px 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(30, 30, 42, 0.96);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  text-align: center;
}

.preview-paused-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(224, 160, 74, 0.14);
  color: #e0a04a;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.preview-paused-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  line-height: 1.7;
}

.preview-paused-action {
  margin-top: 16px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid rgba(108, 155, 255, 0.45);
  border-radius: 6px;
  background: rgba(108, 155, 255, 0.14);
  color: #b9cfff;
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.preview-paused-action:hover {
  background: rgba(108, 155, 255, 0.24);
  border-color: rgba(108, 155, 255, 0.7);
}

:global(.light .preview-paused) {
  background: rgba(255, 255, 255, 0.55);
}

:global(.light .preview-paused-card) {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12);
}

:global(.light .preview-paused-badge) {
  background: rgba(180, 83, 9, 0.1);
  color: #b45309;
}

:global(.light .preview-paused-text) {
  color: rgba(0, 0, 0, 0.65);
}

:global(.light .preview-paused-action) {
  border-color: rgba(37, 99, 235, 0.4);
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
}

:global(.light .preview-paused-action:hover) {
  background: rgba(37, 99, 235, 0.14);
}

:global(.light .preview-container) {
  background: #ffffff;
}

/* 表格列宽拖动：未调整过的表格仍保持主题原有的 auto 布局 */
:deep(.markdown-body table.markit-table-resizable th) {
  position: relative;
}

/* 表格宽度由内联百分比决定：默认 100%，拖动最右列后可能宽于预览内容 */
:deep(.markdown-body table.markit-table-resized) {
  table-layout: fixed;
}

:deep(.markdown-body table.markit-table-resized th),
:deep(.markdown-body table.markit-table-resized td) {
  overflow-wrap: anywhere;
}

:deep(.markit-table-dragging) {
  user-select: none;
}

:deep(.markit-col-resizer) {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
  z-index: 2;
}

/* 末列表头的热区向内收，避免越界触发预览容器的横向滚动条 */
:deep(.markdown-body table.markit-table-resizable th:last-child > .markit-col-resizer) {
  right: 0;
}

:deep(.markit-col-resizer::after) {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0;
  transition: opacity 0.15s;
}

:deep(.markit-table-resizable th:hover > .markit-col-resizer::after),
:deep(.markit-col-resizer:hover::after),
:deep(.markit-col-resizer.dragging::after) {
  opacity: 0.35;
}
</style>

<style>
/* 预览层由脚本创建，没有 scoped 的 data-v 属性，因此放在全局样式里 */
.markit-preview-layer {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  box-sizing: border-box;
  padding: 32px 40px;
}

.markit-preview-layer > .preview-content {
  margin: 0 auto;
}

/*
 * 预览内容只是程序化聚焦锚点（tabIndex = -1），不是键盘导航目标。
 * 聚焦后按 Esc 时浏览器会重新评估焦点可见性，给整块内容绘制 focus ring，
 * 视觉上像「选中了整个预览区」；这里屏蔽它。层内链接等真实可交互元素
 * 仍保留浏览器默认焦点样式，不影响键盘导航。
 */
.markit-preview-layer > .preview-content:focus,
.markit-preview-layer > .preview-content:focus-visible {
  outline: none;
}
</style>
