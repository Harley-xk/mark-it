<!--
  作者: Harley-xk
  创建: 2026-11-17

  描述: 欢迎页 / 空白态下的最近打开浮层，可关闭与清除记录
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentsStore } from '../../stores/documents'
import { useRecentStore } from '../../stores/recent'
import { useFile } from '../../composables/useFile'
import { useI18n } from '../../i18n'
import RecentFilesList from '../common/RecentFilesList.vue'
import type { RecentFileEntry } from '../../../../shared/recent-types'

const docs = useDocumentsStore()
const recent = useRecentStore()
const file = useFile()
const { t } = useI18n()

/** 只在欢迎页或未编辑的空白标签、且存在最近记录时展示 */
const visible = computed(() => {
  if (recent.welcomeDismissed || recent.entries.length === 0) return false
  const doc = docs.activeDoc
  return !!doc && doc.path === null && !doc.isModified
})

function onOpenEntry(entry: RecentFileEntry): void {
  void file.openRecentFile(entry)
}
</script>

<template>
  <Transition name="welcome-recent">
    <section v-if="visible" class="welcome-recent" :aria-label="t('recent.title')">
      <header class="welcome-recent-header">
        <span>{{ t('recent.title') }}</span>
        <button
          type="button"
          class="welcome-recent-close"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="recent.dismissWelcome()"
        >
          ×
        </button>
      </header>
      <RecentFilesList :entries="recent.entries" :max="5" @open="onOpenEntry" />
      <footer class="welcome-recent-footer">
        <button type="button" class="welcome-recent-clear" @click="recent.clear()">
          {{ t('recent.clear') }}
        </button>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
.welcome-recent {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 60;
  width: 300px;
  max-height: min(320px, 55%);
  display: flex;
  flex-direction: column;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(28, 30, 42, 0.94);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(18px);
}

.welcome-recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 6px 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.welcome-recent-close {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.welcome-recent-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.welcome-recent-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 6px;
}

.welcome-recent-clear {
  border: none;
  padding: 3px 8px;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.welcome-recent-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.welcome-recent-enter-active,
.welcome-recent-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.welcome-recent-enter-from,
.welcome-recent-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

:global(.light .welcome-recent) {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.14);
}

:global(.light .welcome-recent-header) {
  color: rgba(0, 0, 0, 0.42);
}

:global(.light .welcome-recent-close) {
  color: rgba(0, 0, 0, 0.42);
}

:global(.light .welcome-recent-close:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}

:global(.light .welcome-recent-footer) {
  border-top-color: rgba(0, 0, 0, 0.06);
}

:global(.light .welcome-recent-clear) {
  color: rgba(0, 0, 0, 0.42);
}

:global(.light .welcome-recent-clear:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}
</style>
