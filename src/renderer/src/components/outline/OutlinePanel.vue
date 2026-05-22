<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'

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
</script>

<template>
  <div class="outline-panel">
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

.light .outline-panel {
  background: rgba(0, 0, 0, 0.02);
  border-right-color: rgba(0, 0, 0, 0.06);
}

.light .outline-title {
  color: rgba(0, 0, 0, 0.35);
}

.light .outline-item {
  color: rgba(0, 0, 0, 0.5);
}

.light .outline-item:hover {
  color: rgba(0, 0, 0, 0.85);
  background: rgba(59, 130, 246, 0.06);
}

.light .outline-empty {
  color: rgba(0, 0, 0, 0.2);
}
</style>
