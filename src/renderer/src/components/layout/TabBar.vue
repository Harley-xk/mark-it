<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useDocumentsStore } from '../../stores/documents'
import { useFile } from '../../composables/useFile'

const docs = useDocumentsStore()
const file = useFile()

const scrollRef = ref<HTMLDivElement>()

/** 鼠标滚轮纵向滚动时，横向翻动标签栏 */
function onWheel(e: WheelEvent): void {
  const el = scrollRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

// 激活的标签滚动到可视区域内
watch(
  () => docs.activeId,
  async () => {
    await nextTick()
    scrollRef.value?.querySelector<HTMLElement>('.tab.active')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    })
  }
)

function onMiddleClick(id: string, e: MouseEvent): void {
  if (e.button !== 1) return
  e.preventDefault()
  file.closeTab(id)
}
</script>

<template>
  <div class="tab-bar">
    <div ref="scrollRef" class="tab-scroll" @wheel="onWheel">
      <div
        v-for="doc in docs.docs"
        :key="doc.id"
        class="tab"
        :class="{ active: doc.id === docs.activeId, modified: doc.isModified }"
        :title="doc.path || doc.name"
        @click="docs.activateDocument(doc.id)"
        @mousedown="onMiddleClick(doc.id, $event)"
      >
        <span class="tab-name">{{ doc.name }}</span>
        <span v-if="doc.isModified" class="tab-dot" title="未保存"></span>
        <button class="tab-close" title="关闭标签页 (Ctrl+W)" @click.stop="file.closeTab(doc.id)">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <button class="tab-new" title="新建 (Ctrl+N)" @click="file.newFile()">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- 标签右侧留白用于拖动窗口 -->
    <div class="drag-space"></div>
  </div>
</template>

<style scoped>
.tab-bar {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.tab-scroll {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.tab-scroll::-webkit-scrollbar {
  display: none;
}

.drag-space {
  flex: 1;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

/* Chrome 风格标签：顶部圆角、贴住标题栏底部 */
.tab {
  flex: 0 0 auto;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-width: 100px;
  max-width: 200px;
  margin: 0 1px;
  padding: 0 30px 0 12px;
  border-radius: 8px 8px 0 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: default;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.85);
}

.tab.active {
  background: rgba(255, 255, 255, 0.11);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c9bff;
}

.tab-close {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    background 0.12s ease;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.tab-new {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  /* 与标签底部对齐，悬停背景与标签齐平 */
  margin: 0 6px 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tab-new:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}
</style>
