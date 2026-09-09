<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  layout: string
  ratio: number
}>()

const emit = defineEmits<{
  'update:ratio': [value: number]
}>()

const isDragging = ref(false)
const containerRef = ref<HTMLDivElement>()

function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = props.layout === 'edit-left' ? e.clientX - rect.left : rect.right - e.clientX
  let ratio = x / rect.width
  ratio = Math.max(0.3, Math.min(0.7, ratio))
  emit('update:ratio', ratio)
}

function onPointerUp() {
  isDragging.value = false
}
</script>

<template>
  <div
    ref="containerRef"
    class="split-pane"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <div class="pane pane-left" :style="{ flex: ratio }">
      <slot name="left" />
    </div>
    <div
      class="divider"
      :class="{ dragging: isDragging }"
      @pointerdown="onPointerDown"
    ></div>
    <div class="pane pane-right" :style="{ flex: 1 - ratio }">
      <slot name="right" />
    </div>
  </div>
</template>

<style scoped>
.split-pane {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.pane {
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.divider {
  width: 1px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
  cursor: col-resize;
  position: relative;
  z-index: 10;
  transition: background 0.15s;
}

.divider::after {
  content: '';
  position: absolute;
  top: 0;
  left: -3px;
  right: -3px;
  bottom: 0;
}

.divider:hover,
.divider.dragging {
  background: rgba(108, 155, 255, 0.4);
  width: 2px;
}

</style>
