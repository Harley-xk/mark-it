<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { svgXmlToPng } from '../../utils/diagram-export'

const props = defineProps<{
  visible: boolean
  /** 已序列化的 SVG 文本（带 xmlns 与固定尺寸） */
  svgXml: string
  width: number
  height: number
  background: string
}>()

const emit = defineEmits<{
  close: []
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.resolvedTheme === 'dark')

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.25

const viewportRef = ref<HTMLDivElement>()
const scale = ref(1)
const overflowing = ref(false)
const objectUrl = ref('')

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)

function revokeUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function updateOverflow(): void {
  const viewport = viewportRef.value
  if (!viewport) return
  overflowing.value =
    props.width * scale.value > viewport.clientWidth - 8 ||
    props.height * scale.value > viewport.clientHeight - 8
}

function applyScale(next: number): void {
  scale.value = clampScale(next)
  updateOverflow()
}

/** 适应窗口：大图缩到可见范围内，小图保持 100% */
function fitToWindow(): void {
  const viewport = viewportRef.value
  if (!viewport) return
  const padding = 48
  const fit = Math.min(
    1,
    (viewport.clientWidth - padding) / Math.max(props.width, 1),
    (viewport.clientHeight - padding) / Math.max(props.height, 1)
  )
  applyScale(fit)
  viewport.scrollTop = 0
  viewport.scrollLeft = 0
}

function close(): void {
  emit('close')
}

/** Ctrl/Cmd + 滚轮缩放，普通滚轮交给容器滚动 */
function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()

  const viewport = viewportRef.value
  if (!viewport) return

  const rect = viewport.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const contentX = viewport.scrollLeft + pointerX
  const contentY = viewport.scrollTop + pointerY

  const before = scale.value
  applyScale(before * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
  const ratio = scale.value / before

  // 保持鼠标指向的内容不动
  viewport.scrollLeft = contentX * ratio - pointerX
  viewport.scrollTop = contentY * ratio - pointerY
}

async function download(extension: 'svg' | 'png'): Promise<void> {
  try {
    const fileName = `mermaid-${Date.now()}.${extension}`
    if (extension === 'svg') {
      await window.api.saveImage(fileName, new TextEncoder().encode(props.svgXml), 'svg')
    } else {
      const png = await svgXmlToPng(props.svgXml, props.width, props.height, props.background)
      await window.api.saveImage(fileName, png, 'png')
    }
  } catch (err) {
    console.error('Failed to export diagram:', err)
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

watch(
  () => [props.visible, props.svgXml] as const,
  async ([visible]) => {
    if (!visible) {
      revokeUrl()
      return
    }

    revokeUrl()
    objectUrl.value = URL.createObjectURL(
      new Blob([props.svgXml], { type: 'image/svg+xml;charset=utf-8' })
    )
    scale.value = 1
    await nextTick()
    fitToWindow()
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
  revokeUrl()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="diagram-modal-backdrop"
      :class="isDark ? 'dark' : 'light'"
      @mousedown.self="close"
    >
      <div class="diagram-modal" role="dialog" aria-modal="true" aria-label="图表预览">
        <div class="diagram-modal-header">
          <span class="diagram-modal-title">图表预览</span>
          <div class="diagram-modal-actions">
            <button
              class="dm-btn"
              type="button"
              title="缩小"
              @click="applyScale(scale / ZOOM_STEP)"
            >
              −
            </button>
            <button
              class="dm-btn dm-zoom-label"
              type="button"
              title="恢复原始大小"
              @click="applyScale(1)"
            >
              {{ zoomLabel }}
            </button>
            <button
              class="dm-btn"
              type="button"
              title="放大"
              @click="applyScale(scale * ZOOM_STEP)"
            >
              ＋
            </button>
            <button class="dm-btn dm-text-btn" type="button" title="适应窗口" @click="fitToWindow">
              适应
            </button>
            <span class="dm-separator"></span>
            <button
              class="dm-btn dm-text-btn"
              type="button"
              title="下载为 SVG"
              @click="download('svg')"
            >
              SVG
            </button>
            <button
              class="dm-btn dm-text-btn"
              type="button"
              title="下载为 PNG"
              @click="download('png')"
            >
              PNG
            </button>
            <span class="dm-separator"></span>
            <button class="dm-btn dm-close" type="button" title="关闭 (Esc)" @click="close">
              ✕
            </button>
          </div>
        </div>

        <div
          ref="viewportRef"
          class="diagram-modal-viewport"
          :class="{ overflowing }"
          @wheel="onWheel"
        >
          <div class="diagram-modal-canvas" :style="{ zoom: String(scale) }">
            <img
              :src="objectUrl"
              :width="width"
              :height="height"
              alt="图表预览"
              draggable="false"
            />
          </div>
        </div>

        <div class="diagram-modal-hint">滚轮滚动 · Ctrl/Cmd + 滚轮缩放 · Esc 关闭</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.diagram-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.diagram-modal {
  display: flex;
  flex-direction: column;
  width: min(1200px, 94vw);
  height: min(820px, 88vh);
  border-radius: 12px;
  overflow: hidden;
  background: #1e1e24;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}

.diagram-modal-backdrop.light .diagram-modal {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
}

.diagram-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 46px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  user-select: none;
}

.diagram-modal-backdrop.light .diagram-modal-header {
  border-bottom-color: rgba(0, 0, 0, 0.07);
}

.diagram-modal-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-modal-backdrop.light .diagram-modal-title {
  color: rgba(0, 0, 0, 0.75);
}

.diagram-modal-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dm-btn {
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

.dm-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.diagram-modal-backdrop.light .dm-btn {
  color: rgba(0, 0, 0, 0.6);
}

.diagram-modal-backdrop.light .dm-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.dm-text-btn {
  font-size: 11px;
}

.dm-zoom-label {
  min-width: 48px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.diagram-modal-backdrop.light .dm-zoom-label {
  color: rgba(0, 0, 0, 0.5);
}

.dm-separator {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.diagram-modal-backdrop.light .dm-separator {
  background: rgba(0, 0, 0, 0.1);
}

.dm-close {
  font-size: 13px;
}

.diagram-modal-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  padding: 0;
  background: rgba(0, 0, 0, 0.12);
  overscroll-behavior: contain;
}

.diagram-modal-backdrop.light .diagram-modal-viewport {
  background: rgba(0, 0, 0, 0.03);
}

/* 放大到超出窗口后改为从左上角排列，保证整张图都能滚动到 */
.diagram-modal-viewport.overflowing {
  justify-content: flex-start;
  align-items: flex-start;
}

.diagram-modal-canvas {
  flex: 0 0 auto;
  margin: auto;
  line-height: 0;
}

.diagram-modal-viewport.overflowing .diagram-modal-canvas {
  margin: 0;
}

.diagram-modal-canvas img {
  display: block;
  max-width: none;
  max-height: none;
  user-select: none;
  -webkit-user-drag: none;
}

.diagram-modal-hint {
  flex-shrink: 0;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  user-select: none;
}

.diagram-modal-backdrop.light .diagram-modal-hint {
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.35);
}
</style>
