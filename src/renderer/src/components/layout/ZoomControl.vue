<!--
 * 作者: Harley-xk
 * 创建: 2026-11-13
 *
 * 描述: 状态栏缩放控件，提供手动步进、预设比例与复位 100% 的入口
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useGlobalZoom } from '../../composables/useGlobalZoom'

const { percent, atMin, atMax, presets, percentOf, setZoom, stepZoom, resetZoom } = useGlobalZoom()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  if (root.value?.contains(event.target as Node)) return
  open.value = false
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (!open.value || event.key !== 'Escape') return
  event.stopPropagation()
  open.value = false
}

watch(open, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeyDown, true)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeyDown, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeyDown, true)
})
</script>

<template>
  <div ref="root" class="zoom-control">
    <button
      class="zoom-trigger"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-haspopup="true"
      :title="`缩放 ${percent}%，点击手动调整`"
      @click="open = !open"
    >
      缩放 {{ percent }}%
    </button>
    <div v-if="open" class="zoom-panel" role="group" aria-label="缩放调整">
      <div class="zoom-stepper">
        <button
          class="zoom-step"
          :disabled="atMin"
          title="缩小 (Ctrl/Cmd + -)"
          aria-label="缩小"
          @click="stepZoom(-1)"
        >
          −
        </button>
        <button class="zoom-value" title="恢复 100% (Ctrl/Cmd + 0)" @click="resetZoom">
          {{ percent }}%
        </button>
        <button
          class="zoom-step"
          :disabled="atMax"
          title="放大 (Ctrl/Cmd + =)"
          aria-label="放大"
          @click="stepZoom(1)"
        >
          +
        </button>
      </div>
      <div class="zoom-presets">
        <button
          v-for="factor in presets"
          :key="factor"
          class="zoom-preset"
          :class="{ 'is-current': percent === percentOf(factor) }"
          :title="`缩放到 ${percentOf(factor)}%`"
          @click="setZoom(factor)"
        >
          {{ percentOf(factor) }}%
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.zoom-control {
  position: relative;
  display: flex;
  align-items: center;
}

.zoom-trigger {
  height: 18px;
  padding: 0 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.zoom-trigger:hover,
.zoom-trigger.is-open {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

.zoom-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 80;
  width: 172px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(30, 30, 42, 0.97);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(20px);
}

.zoom-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.zoom-step,
.zoom-value {
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.82);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.zoom-step {
  width: 30px;
  font-size: 14px;
  line-height: 1;
}

.zoom-value {
  flex: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.zoom-step:hover:not(:disabled),
.zoom-value:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
}

.zoom-step:disabled {
  opacity: 0.35;
  cursor: default;
}

.zoom-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.zoom-preset {
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.zoom-preset:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.zoom-preset.is-current {
  border-color: rgba(108, 155, 255, 0.45);
  background: rgba(108, 155, 255, 0.18);
  color: #b9cfff;
}

:global(.light .zoom-trigger:hover),
:global(.light .zoom-trigger.is-open) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.72);
}

:global(.light .zoom-panel) {
  border-color: rgba(0, 0, 0, 0.08);
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
}

:global(.light .zoom-step),
:global(.light .zoom-value) {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
}

:global(.light .zoom-step:hover:not(:disabled)),
:global(.light .zoom-value:hover) {
  border-color: rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.07);
}

:global(.light .zoom-preset) {
  color: rgba(0, 0, 0, 0.55);
}

:global(.light .zoom-preset:hover) {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

:global(.light .zoom-preset.is-current) {
  border-color: rgba(37, 99, 235, 0.35);
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}
</style>
