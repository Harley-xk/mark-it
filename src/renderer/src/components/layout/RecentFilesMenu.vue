<!--
  作者: Harley-xk
  创建: 2026-11-17

  描述: 工具栏「最近打开」按钮与下拉列表
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRecentStore } from '../../stores/recent'
import { useFile } from '../../composables/useFile'
import { useI18n } from '../../i18n'
import RecentFilesList from '../common/RecentFilesList.vue'
import type { RecentFileEntry } from '../../../../shared/recent-types'

const recent = useRecentStore()
const file = useFile()
const { t } = useI18n()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function onOpenEntry(entry: RecentFileEntry): void {
  close()
  void file.openRecentFile(entry)
}

function onClear(): void {
  void recent.clear()
}

function onPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const target = event.target
  if (root.value && target instanceof Node && root.value.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="recent-menu-root">
    <button
      class="tb-btn"
      :class="{ active: open }"
      :title="t('toolbar.recent')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </svg>
    </button>

    <div v-if="open" class="recent-popover" role="menu" :aria-label="t('recent.title')">
      <div class="recent-popover-header">
        <span>{{ t('recent.title') }}</span>
        <button
          v-if="recent.entries.length > 0"
          type="button"
          class="recent-clear"
          @click="onClear"
        >
          {{ t('recent.clear') }}
        </button>
      </div>
      <RecentFilesList :entries="recent.entries" :max="10" @open="onOpenEntry" />
    </div>
  </div>
</template>

<style scoped>
.recent-menu-root {
  position: relative;
  display: flex;
}

/* 工具栏按钮样式在 Toolbar.vue 中按 scoped 定义，子组件需要重复一份 */
.tb-btn {
  width: 32px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}

.tb-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.tb-btn.active {
  background: rgba(108, 155, 255, 0.12);
  color: #6c9bff;
}

:global(.light .recent-menu-root .tb-btn) {
  color: rgba(0, 0, 0, 0.45);
}

:global(.light .recent-menu-root .tb-btn:hover) {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
}

:global(.light .recent-menu-root .tb-btn.active) {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.recent-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 90;
  width: 300px;
  max-height: min(420px, 60vh);
  overflow-y: auto;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(28, 30, 42, 0.97);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(16px);
}

.recent-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.recent-clear {
  border: none;
  padding: 2px 6px;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.recent-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

:global(.light .recent-popover) {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
}

:global(.light .recent-popover-header) {
  color: rgba(0, 0, 0, 0.42);
}

:global(.light .recent-clear) {
  color: rgba(0, 0, 0, 0.42);
}

:global(.light .recent-clear:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}
</style>
