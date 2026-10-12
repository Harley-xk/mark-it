<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/app'
import { useEditorStore } from '../../stores/editor'

const app = useAppStore()
const editorStore = useEditorStore()

const flatHeadings = computed(() => {
  return flattenHeadings(editorStore.headings)
})

function flattenHeadings(items: { id: string; level: number; text: string; children: any[] }[]): { id: string; level: number; text: string }[] {
  const result: { id: string; level: number; text: string }[] = []
  for (const item of items) {
    result.push({ id: item.id, level: item.level, text: item.text })
    result.push(...flattenHeadings(item.children))
  }
  return result
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const panelRef = ref<HTMLDivElement>()
const isResizing = ref(false)

function onResizeDown(e: PointerEvent): void {
  isResizing.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent): void {
  if (!isResizing.value || !panelRef.value) return
  const rect = panelRef.value.getBoundingClientRect()
  const width = Math.round(Math.min(500, Math.max(160, e.clientX - rect.left)))
  app.outlineWidth = width
}

function onResizeUp(): void {
  isResizing.value = false
}
</script>

<template>
  <div
    ref="panelRef"
    class="outline-panel"
    :class="{ resizing: isResizing }"
    :style="{ width: `${app.outlineWidth}px` }"
  >
    <div class="outline-header">
      <span class="outline-title">大纲</span>
    </div>
    <div class="outline-body">
      <template v-if="flatHeadings.length">
        <div
          v-for="h in flatHeadings"
          :key="h.id"
          class="outline-item"
          :style="{ paddingLeft: `${(h.level - 1) * 16 + 12}px` }"
          @click="scrollToHeading(h.id)"
        >
          {{ h.text }}
        </div>
      </template>
      <div v-else class="outline-empty">暂无大纲</div>
    </div>
    <div
      class="outline-resizer"
      :class="{ dragging: isResizing }"
      @pointerdown="onResizeDown"
      @pointermove="onResizeMove"
      @pointerup="onResizeUp"
    ></div>
  </div>
</template>

<style scoped>
.outline-panel {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.02);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  position: relative;
}

.outline-panel.resizing,
.outline-panel.resizing * {
  user-select: none;
}

.outline-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.outline-resizer:hover,
.outline-resizer.dragging {
  background: rgba(108, 155, 255, 0.4);
}

.outline-header {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.outline-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.35);
}

.outline-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.outline-item {
  padding: 5px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s ease;
}

.outline-item:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(108, 155, 255, 0.06);
}

.outline-empty {
  padding: 20px 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.2);
  text-align: center;
}

:global(.light) .outline-panel {
  background: #ffffff;
  border-right-color: rgba(0, 0, 0, 0.06);
}

:global(.light) .outline-resizer:hover,
:global(.light) .outline-resizer.dragging {
  background: rgba(59, 130, 246, 0.4);
}
</style>
