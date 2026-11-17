<!--
  作者: Harley-xk
  创建: 2026-11-17

  描述: 最近打开文件的按键列表，供工具栏菜单与欢迎态浮层复用
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { RecentFileEntry } from '../../../../shared/recent-types'
import { directoryOf } from '../../utils/recent-files'
import { useI18n } from '../../i18n'

const props = withDefaults(defineProps<{ entries: RecentFileEntry[]; max?: number }>(), { max: 10 })
const emit = defineEmits<{ open: [entry: RecentFileEntry] }>()
const { t } = useI18n()

const visible = computed(() => props.entries.slice(0, props.max))
</script>

<template>
  <ul class="recent-list">
    <li v-for="entry in visible" :key="entry.path">
      <button
        type="button"
        class="recent-item"
        :class="{ missing: entry.missing }"
        :disabled="entry.missing"
        :title="entry.path"
        @click="emit('open', entry)"
      >
        <span class="recent-name">{{ entry.name }}</span>
        <span class="recent-dir">
          {{ entry.missing ? t('recent.missing') : directoryOf(entry.path) }}
        </span>
      </button>
    </li>
    <li v-if="visible.length === 0" class="recent-empty">{{ t('recent.empty') }}</li>
  </ul>
</template>

<style scoped>
.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.recent-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
}

.recent-item:focus-visible {
  outline: 2px solid rgba(108, 155, 255, 0.6);
  outline-offset: -2px;
}

.recent-item.missing {
  color: rgba(255, 255, 255, 0.32);
  cursor: default;
}

.recent-name,
.recent-dir {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-name {
  font-size: 12.5px;
}

.recent-dir {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.recent-empty {
  padding: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

:global(.light .recent-item) {
  color: rgba(0, 0, 0, 0.78);
}

:global(.light .recent-item:hover:not(:disabled)) {
  background: rgba(0, 0, 0, 0.05);
}

:global(.light .recent-item.missing) {
  color: rgba(0, 0, 0, 0.3);
}

:global(.light .recent-dir) {
  color: rgba(0, 0, 0, 0.38);
}

:global(.light .recent-empty) {
  color: rgba(0, 0, 0, 0.38);
}
</style>
