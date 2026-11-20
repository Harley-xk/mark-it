<!--
  * 作者: Harley-xk
  * 创建: 2026-11-20
  *
  * 描述: 独立预览窗口，承载图表与图片的缩放、适应、保存与下载
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import appIconUrl from '@resources/icon.png'
import { useI18n } from '../i18n'
import { svgXmlToPng } from '../utils/diagram-export'
import {
  anchoredScroll,
  centeredScroll,
  clampPreviewScale,
  computeFitScale,
  imageExtensionFromFileName,
  PREVIEW_PADDING,
  PREVIEW_ZOOM_STEP,
  type PreviewGeometry,
  type PreviewPoint
} from '../utils/media-preview'
import type { PreviewWindowPayload } from '../../../shared/preview-types'

const { t } = useI18n()
const platform = window.api.platform

const payload = ref<PreviewWindowPayload | null>(null)
const viewportRef = ref<HTMLDivElement>()
const scale = ref(1)
/** 自动适应模式下，窗口尺寸变化会重新适应并居中 */
const autoFit = ref(true)
const errorMessage = ref('')
const objectUrl = ref('')

const media = computed(() => payload.value?.media ?? null)
const theme = computed(() => payload.value?.theme ?? 'dark')
const mediaWidth = computed(() => Math.max(1, media.value?.width || 800))
const mediaHeight = computed(() => Math.max(1, media.value?.height || 600))
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)

const headerTitle = computed(() => {
  const item = media.value
  if (!item) return t('window.previewTitle')
  return item.kind === 'diagram'
    ? t('preview.diagramTitle')
    : `${t('preview.imageTitle')} · ${item.fileName}`
})

const displaySrc = computed(() => {
  const item = media.value
  if (!item) return ''
  return item.kind === 'image' ? item.src : objectUrl.value
})

const imageStyle = computed(() => ({
  width: `${mediaWidth.value * scale.value}px`,
  height: `${mediaHeight.value * scale.value}px`,
  background: media.value?.background
}))

const stageStyle = computed(() => ({
  width: `${mediaWidth.value * scale.value + PREVIEW_PADDING * 2}px`,
  height: `${mediaHeight.value * scale.value + PREVIEW_PADDING * 2}px`
}))

watch(
  headerTitle,
  (value) => {
    document.title = value
  },
  { immediate: true }
)

function revokeUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

function geometryFor(
  value: number,
  viewportWidth?: number,
  viewportHeight?: number
): PreviewGeometry | null {
  const viewport = viewportRef.value
  if (!viewport) return null
  return {
    width: mediaWidth.value,
    height: mediaHeight.value,
    viewportWidth: viewportWidth ?? viewport.clientWidth,
    viewportHeight: viewportHeight ?? viewport.clientHeight,
    scale: value,
    padding: PREVIEW_PADDING
  }
}

/**
 * 缩放排队执行：连续滚轮事件之间需要等上一轮 DOM 尺寸更新完成。
 * requestedScale 在入队时同步更新，避免连续点击 / 滚动都基于同一个旧比例计算。
 */
let zoomChain: Promise<void> = Promise.resolve()
let requestedScale = 1
/** 当前预览内容的标记：替换载荷时丢弃上一份内容排队的缩放任务 */
let mediaToken = 0

function applyScale(next: number, anchor?: PreviewPoint | null, center = false): Promise<void> {
  requestedScale = clampPreviewScale(next)
  const token = mediaToken
  const run = (): Promise<void> => {
    if (token !== mediaToken) return Promise.resolve()
    return applyScaleNow(next, anchor, center)
  }
  zoomChain = zoomChain.then(run, run)
  return zoomChain
}

async function applyScaleNow(
  next: number,
  anchor?: PreviewPoint | null,
  center = false
): Promise<void> {
  const viewport = viewportRef.value
  if (!media.value || !viewport) return

  const target = clampPreviewScale(next)
  if (target === scale.value) return

  const before = geometryFor(scale.value)
  if (!before) return
  const pointer = anchor ?? {
    x: before.viewportWidth / 2,
    y: before.viewportHeight / 2
  }
  const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop }

  scale.value = target
  await nextTick()

  // 缩放后滚动条可能出现 / 消失，按新的视口尺寸重新计算
  const after = geometryFor(target)
  if (!after) return
  const nextScroll = center ? centeredScroll(after) : anchoredScroll(before, after, pointer, scroll)
  viewport.scrollLeft = nextScroll.left
  viewport.scrollTop = nextScroll.top
}

/** 适应窗口：大图缩到可见范围内，小图保持 100%，随后居中 */
async function fitToWindow(): Promise<void> {
  const viewport = viewportRef.value
  const geometry = geometryFor(scale.value)
  if (!viewport || !geometry) return

  const target = clampPreviewScale(
    computeFitScale(
      geometry.width,
      geometry.height,
      geometry.viewportWidth,
      geometry.viewportHeight,
      PREVIEW_PADDING
    )
  )
  autoFit.value = true
  requestedScale = target

  if (target === scale.value) {
    const current = geometryFor(target)
    if (!current) return
    const scroll = centeredScroll(current)
    viewport.scrollLeft = scroll.left
    viewport.scrollTop = scroll.top
    return
  }
  await applyScale(target, null, true)
}

function zoomBy(factor: number): void {
  autoFit.value = false
  void applyScale(requestedScale * factor)
}

function resetZoom(): void {
  autoFit.value = false
  void applyScale(1)
}

/** Ctrl/Cmd + 滚轮以鼠标为锚点缩放，普通滚轮交给视口滚动 */
function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()

  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  autoFit.value = false
  void applyScale(requestedScale * (event.deltaY < 0 ? PREVIEW_ZOOM_STEP : 1 / PREVIEW_ZOOM_STEP), {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  })
}

function reportFailure(message: string, err: unknown): void {
  errorMessage.value = message
  console.error('Failed to save preview media:', err)
}

async function downloadDiagram(extension: 'svg' | 'png'): Promise<void> {
  const item = media.value
  if (item?.kind !== 'diagram') return
  try {
    errorMessage.value = ''
    const fileName = `mermaid-${Date.now()}.${extension}`
    if (extension === 'svg') {
      await window.api.saveImage(fileName, new TextEncoder().encode(item.svgXml), 'svg')
    } else {
      const png = await svgXmlToPng(item.svgXml, item.width, item.height, item.background)
      await window.api.saveImage(fileName, png, 'png')
    }
  } catch (err) {
    reportFailure(t('preview.saveFailed'), err)
  }
}

/** data URL 直接解码，避免受 CSP connect-src 限制；其余地址再退回 fetch */
async function readImageBytes(src: string): Promise<Uint8Array> {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',')
    if (comma === -1) throw new Error('Invalid data URL')
    const meta = src.slice(5, comma)
    const body = src.slice(comma + 1)
    if (/;base64/i.test(meta)) {
      const binary = atob(body)
      return Uint8Array.from(binary, (char) => char.charCodeAt(0))
    }
    return new TextEncoder().encode(decodeURIComponent(body))
  }
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Failed to read image: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/** 本地图片直接复制文件；远程图由主进程下载；data 图片先取字节再保存 */
async function saveImage(): Promise<void> {
  const item = media.value
  if (item?.kind !== 'image') return
  try {
    errorMessage.value = ''
    if (item.localPath) {
      await window.api.saveImageFromPath(item.localPath, item.fileName)
      return
    }
    if (item.remote) {
      try {
        await window.api.downloadImage(item.src, item.fileName)
      } catch (err) {
        reportFailure(t('preview.downloadFailed'), err)
      }
      return
    }
    const bytes = await readImageBytes(item.src)
    await window.api.saveImage(item.fileName, bytes, imageExtensionFromFileName(item.fileName))
  } catch (err) {
    reportFailure(t('preview.saveFailed'), err)
  }
}

async function openFolder(): Promise<void> {
  const item = media.value
  if (item?.kind !== 'image' || !item.localPath) return
  try {
    await window.api.showItemInFolder(item.localPath)
  } catch (err) {
    reportFailure(t('preview.saveFailed'), err)
  }
}

function closeWindow(): void {
  void window.api.preview.close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  closeWindow()
}

/** 替换预览内容：图表重建 Blob URL，图片直接使用载荷地址 */
function applyPayload(next: PreviewWindowPayload): void {
  mediaToken += 1
  revokeUrl()
  errorMessage.value = ''
  payload.value = next

  if (next.media.kind === 'diagram') {
    objectUrl.value = URL.createObjectURL(
      new Blob([next.media.svgXml], { type: 'image/svg+xml;charset=utf-8' })
    )
  }
  scale.value = 1
  requestedScale = 1
  autoFit.value = true
  void nextTick().then(async () => {
    await fitToWindow()
    observeViewport()
  })
}

let resizeObserver: ResizeObserver | null = null

function observeViewport(): void {
  if (typeof ResizeObserver === 'undefined') return
  const viewport = viewportRef.value
  if (!viewport) return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    if (autoFit.value) void fitToWindow()
  })
  resizeObserver.observe(viewport)
}

let offPayload: (() => void) | null = null

onMounted(async () => {
  offPayload = window.api.preview.onPayload(applyPayload)
  const initial = await window.api.preview.takePayload()
  if (initial) applyPayload(initial)
  observeViewport()
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  offPayload?.()
  offPayload = null
  resizeObserver?.disconnect()
  resizeObserver = null
  revokeUrl()
})
</script>

<template>
  <div class="preview-window" :class="theme">
    <header class="preview-header" :class="platform">
      <div class="preview-title">
        <img :src="appIconUrl" alt="" aria-hidden="true" />
        <span>{{ headerTitle }}</span>
      </div>
      <div class="preview-actions">
        <button
          class="preview-btn"
          type="button"
          :title="t('preview.zoomOut')"
          @click="zoomBy(1 / PREVIEW_ZOOM_STEP)"
        >
          −
        </button>
        <button
          class="preview-btn preview-zoom-label"
          type="button"
          :title="t('preview.restoreSize')"
          @click="resetZoom"
        >
          {{ zoomLabel }}
        </button>
        <button
          class="preview-btn"
          type="button"
          :title="t('preview.zoomIn')"
          @click="zoomBy(PREVIEW_ZOOM_STEP)"
        >
          ＋
        </button>
        <button
          class="preview-btn preview-text-btn"
          type="button"
          :title="t('preview.fitWindow')"
          @click="fitToWindow"
        >
          {{ t('preview.fitWindowShort') }}
        </button>
        <span class="preview-separator"></span>
        <template v-if="media?.kind === 'diagram'">
          <button
            class="preview-btn preview-text-btn"
            type="button"
            :title="t('preview.downloadSvg')"
            @click="downloadDiagram('svg')"
          >
            SVG
          </button>
          <button
            class="preview-btn preview-text-btn"
            type="button"
            :title="t('preview.downloadPng')"
            @click="downloadDiagram('png')"
          >
            PNG
          </button>
        </template>
        <template v-else-if="media?.kind === 'image'">
          <button
            v-if="media.localPath"
            class="preview-btn preview-text-btn"
            type="button"
            :title="t('preview.openFolder')"
            @click="openFolder"
          >
            {{ t('preview.openFolder') }}
          </button>
          <button
            class="preview-btn preview-text-btn"
            type="button"
            :title="media.remote ? t('preview.downloadImage') : t('preview.saveImageAs')"
            @click="saveImage"
          >
            {{ media.remote ? t('preview.downloadImage') : t('preview.saveImageAs') }}
          </button>
        </template>
        <span class="preview-separator"></span>
        <button
          class="preview-btn preview-close"
          type="button"
          :title="t('common.close')"
          @click="closeWindow"
        >
          ✕
        </button>
      </div>
    </header>

    <div ref="viewportRef" class="preview-viewport" @wheel="onWheel">
      <div v-if="media" class="preview-stage" :style="stageStyle">
        <img
          class="preview-image"
          :src="displaySrc"
          :style="imageStyle"
          :alt="headerTitle"
          draggable="false"
        />
      </div>
    </div>

    <div class="preview-hint" :class="{ error: !!errorMessage }">
      {{ errorMessage || t('preview.diagramHint') }}
    </div>
  </div>
</template>

<style scoped>
.preview-window {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #1e1e24;
  color: rgba(255, 255, 255, 0.8);
}

.preview-window.light {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.75);
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 36px;
  /* 右侧为 Windows / Linux 系统窗口控制按钮预留 */
  padding: 0 148px 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.12);
  -webkit-app-region: drag;
  user-select: none;
}

.preview-header.darwin {
  padding-right: 14px;
  padding-left: 88px;
}

.preview-window.light .preview-header {
  border-bottom-color: rgba(0, 0, 0, 0.07);
  background: rgba(0, 0, 0, 0.03);
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-title img {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.preview-btn {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.preview-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.preview-window.light .preview-btn {
  color: rgba(0, 0, 0, 0.62);
}

.preview-window.light .preview-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.preview-text-btn {
  font-size: 11px;
}

.preview-zoom-label {
  min-width: 48px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.preview-window.light .preview-zoom-label {
  color: rgba(0, 0, 0, 0.5);
}

.preview-separator {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.preview-window.light .preview-separator {
  background: rgba(0, 0, 0, 0.1);
}

.preview-close {
  font-size: 13px;
}

.preview-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: rgba(0, 0, 0, 0.18);
  overscroll-behavior: contain;
}

.preview-window.light .preview-viewport {
  background: rgba(0, 0, 0, 0.04);
}

.preview-stage {
  flex: 0 0 auto;
  min-width: 100%;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.preview-image {
  display: block;
  max-width: none;
  max-height: none;
  object-fit: fill;
  user-select: none;
  -webkit-user-drag: none;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.28);
}

.preview-window.light .preview-image {
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.12);
}

.preview-hint {
  flex-shrink: 0;
  padding: 7px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  user-select: none;
}

.preview-hint.error {
  color: #f08c8c;
}

.preview-window.light .preview-hint {
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}

.preview-window.light .preview-hint.error {
  color: #c0392b;
}
</style>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background: #1e1e24;
}
</style>
