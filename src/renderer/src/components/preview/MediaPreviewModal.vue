<!--
  * 作者: Harley-xk
  * 创建: 2026-11-20
  *
  * 描述: 全窗口大图预览，图表与图片共用缩放、适应、保存与下载能力
-->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { useI18n } from '../../i18n'
import { svgXmlToPng } from '../../utils/diagram-export'
import {
  anchoredScroll,
  centeredScroll,
  clampPreviewScale,
  computeFitScale,
  imageExtensionFromFileName,
  PREVIEW_PADDING,
  PREVIEW_ZOOM_STEP,
  type MediaPreviewItem,
  type PreviewGeometry,
  type PreviewPoint
} from '../../utils/media-preview'

const props = defineProps<{
  visible: boolean
  item: MediaPreviewItem | null
}>()

const emit = defineEmits<{
  close: []
}>()

const appStore = useAppStore()
const { t } = useI18n()
const isDark = computed(() => appStore.resolvedTheme === 'dark')

const viewportRef = ref<HTMLDivElement>()
const scale = ref(1)
/** 自动适应模式下，窗口尺寸变化会重新适应并居中 */
const autoFit = ref(true)
const errorMessage = ref('')
const objectUrl = ref('')

const mediaWidth = computed(() => Math.max(1, props.item?.width || 800))
const mediaHeight = computed(() => Math.max(1, props.item?.height || 600))
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)

const headerTitle = computed(() => {
  const item = props.item
  if (!item) return ''
  return item.kind === 'diagram'
    ? t('preview.diagramTitle')
    : `${t('preview.imageTitle')} · ${item.fileName}`
})

const displaySrc = computed(() => {
  const item = props.item
  if (!item) return ''
  return item.kind === 'image' ? item.src : objectUrl.value
})

const imageStyle = computed(() => ({
  width: `${mediaWidth.value * scale.value}px`,
  height: `${mediaHeight.value * scale.value}px`,
  background: props.item?.background
}))

const stageStyle = computed(() => ({
  width: `${mediaWidth.value * scale.value + PREVIEW_PADDING * 2}px`,
  height: `${mediaHeight.value * scale.value + PREVIEW_PADDING * 2}px`
}))

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
/** 当前预览会话的标记：切换图片时丢弃上一张图排队的缩放任务 */
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
  if (!props.visible || !props.item || !viewport) return

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

function close(): void {
  emit('close')
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
  const item = props.item
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

/** 本地图片直接复制文件；远程图由主进程下载；data/blob 图片先取字节再保存 */
async function saveImage(): Promise<void> {
  const item = props.item
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
    const response = await fetch(item.src)
    if (!response.ok) throw new Error(`Failed to read image: HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await window.api.saveImage(item.fileName, bytes, imageExtensionFromFileName(item.fileName))
  } catch (err) {
    reportFailure(t('preview.saveFailed'), err)
  }
}

async function openFolder(): Promise<void> {
  const item = props.item
  if (item?.kind !== 'image' || !item.localPath) return
  try {
    await window.api.showItemInFolder(item.localPath)
  } catch (err) {
    reportFailure(t('preview.saveFailed'), err)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.visible) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
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

function disconnectViewport(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
}

watch(
  () => [props.visible, props.item] as const,
  async ([visible, item]) => {
    mediaToken += 1
    disconnectViewport()
    revokeUrl()
    errorMessage.value = ''
    if (!visible || !item) return

    if (item.kind === 'diagram') {
      objectUrl.value = URL.createObjectURL(
        new Blob([item.svgXml], { type: 'image/svg+xml;charset=utf-8' })
      )
    }
    scale.value = 1
    requestedScale = 1
    autoFit.value = true
    await nextTick()
    await fitToWindow()
    observeViewport()
  },
  { immediate: true }
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) window.addEventListener('keydown', onKeydown, true)
    else window.removeEventListener('keydown', onKeydown, true)
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  disconnectViewport()
  revokeUrl()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && item" class="media-preview-backdrop" :class="isDark ? 'dark' : 'light'">
      <div class="media-preview" role="dialog" aria-modal="true" :aria-label="headerTitle">
        <div class="media-preview-header">
          <span class="media-preview-title" :title="headerTitle">{{ headerTitle }}</span>
          <div class="media-preview-actions">
            <button
              class="mp-btn"
              type="button"
              :title="t('preview.zoomOut')"
              @click="zoomBy(1 / PREVIEW_ZOOM_STEP)"
            >
              −
            </button>
            <button
              class="mp-btn mp-zoom-label"
              type="button"
              :title="t('preview.restoreSize')"
              @click="resetZoom"
            >
              {{ zoomLabel }}
            </button>
            <button
              class="mp-btn"
              type="button"
              :title="t('preview.zoomIn')"
              @click="zoomBy(PREVIEW_ZOOM_STEP)"
            >
              ＋
            </button>
            <button
              class="mp-btn mp-text-btn"
              type="button"
              :title="t('preview.fitWindow')"
              @click="fitToWindow"
            >
              {{ t('preview.fitWindowShort') }}
            </button>
            <span class="mp-separator"></span>
            <template v-if="item.kind === 'diagram'">
              <button
                class="mp-btn mp-text-btn"
                type="button"
                :title="t('preview.downloadSvg')"
                @click="downloadDiagram('svg')"
              >
                SVG
              </button>
              <button
                class="mp-btn mp-text-btn"
                type="button"
                :title="t('preview.downloadPng')"
                @click="downloadDiagram('png')"
              >
                PNG
              </button>
            </template>
            <template v-else>
              <button
                v-if="item.localPath"
                class="mp-btn mp-text-btn"
                type="button"
                :title="t('preview.openFolder')"
                @click="openFolder"
              >
                {{ t('preview.openFolder') }}
              </button>
              <button
                class="mp-btn mp-text-btn"
                type="button"
                :title="item.remote ? t('preview.downloadImage') : t('preview.saveImageAs')"
                @click="saveImage"
              >
                {{ item.remote ? t('preview.downloadImage') : t('preview.saveImageAs') }}
              </button>
            </template>
            <span class="mp-separator"></span>
            <button class="mp-btn mp-close" type="button" :title="t('search.close')" @click="close">
              ✕
            </button>
          </div>
        </div>

        <div ref="viewportRef" class="media-preview-viewport" @wheel="onWheel">
          <div class="media-preview-stage" :style="stageStyle">
            <img
              class="media-preview-image"
              :src="displaySrc"
              :style="imageStyle"
              :alt="headerTitle"
              draggable="false"
            />
          </div>
        </div>

        <div class="media-preview-hint" :class="{ error: !!errorMessage }">
          {{ errorMessage || t('preview.diagramHint') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.media-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  background: #14141a;
}

.media-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1e1e24;
}

.media-preview-backdrop.light {
  background: #f5f6f8;
}

.media-preview-backdrop.light .media-preview {
  background: #ffffff;
}

.media-preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 46px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  user-select: none;
}

.media-preview-backdrop.light .media-preview-header {
  border-bottom-color: rgba(0, 0, 0, 0.07);
}

.media-preview-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-preview-backdrop.light .media-preview-title {
  color: rgba(0, 0, 0, 0.75);
}

.media-preview-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.mp-btn {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.mp-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.media-preview-backdrop.light .mp-btn {
  color: rgba(0, 0, 0, 0.6);
}

.media-preview-backdrop.light .mp-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.mp-text-btn {
  font-size: 11px;
}

.mp-zoom-label {
  min-width: 48px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.media-preview-backdrop.light .mp-zoom-label {
  color: rgba(0, 0, 0, 0.5);
}

.mp-separator {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.media-preview-backdrop.light .mp-separator {
  background: rgba(0, 0, 0, 0.1);
}

.mp-close {
  font-size: 13px;
}

.media-preview-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: rgba(0, 0, 0, 0.18);
  overscroll-behavior: contain;
}

.media-preview-backdrop.light .media-preview-viewport {
  background: rgba(0, 0, 0, 0.04);
}

.media-preview-stage {
  flex: 0 0 auto;
  min-width: 100%;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.media-preview-image {
  display: block;
  max-width: none;
  max-height: none;
  object-fit: fill;
  user-select: none;
  -webkit-user-drag: none;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.28);
}

.media-preview-backdrop.light .media-preview-image {
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.12);
}

.media-preview-hint {
  flex-shrink: 0;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  user-select: none;
}

.media-preview-hint.error {
  color: #f08c8c;
}

.media-preview-backdrop.light .media-preview-hint {
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}

.media-preview-backdrop.light .media-preview-hint.error {
  color: #c0392b;
}
</style>
