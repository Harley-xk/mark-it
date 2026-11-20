<!--
  作者: Harley-xk
  创建: 2026-11-20

  描述: 标题栏标签总览按钮与下拉弹窗，列出当前标签与未打开的最近文件
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAppStore } from '../../stores/app'
import { useDocumentsStore } from '../../stores/documents'
import { useRecentStore } from '../../stores/recent'
import { useFile } from '../../composables/useFile'
import { useI18n } from '../../i18n'
import { directoryOf } from '../../utils/recent-files'
import { relativeTimeParts } from '../../utils/relative-time'
import { samePath } from '../../utils/path'
import type { RecentFileEntry } from '../../../../shared/recent-types'

const docs = useDocumentsStore()
const recent = useRecentStore()
const app = useAppStore()
const file = useFile()
const { locale, t } = useI18n()

const MAX_RECENT = 10
const POPOVER_WIDTH = 340
const SAFE_MARGIN = 6
const REFRESH_INTERVAL = 30_000

const open = ref(false)
const now = ref(Date.now())
const left = ref(0)
const top = ref(0)
const buttonRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** 排除当前窗口已打开的文件，避免与「当前标签」重复 */
const otherEntries = computed<RecentFileEntry[]>(() => {
  const openPaths = docs.docs.map((doc) => doc.path).filter((path): path is string => !!path)
  return recent.entries
    .filter((entry) => !openPaths.some((path) => samePath(path, entry.path)))
    .slice(0, MAX_RECENT)
})

function formatTime(timestamp: number): string {
  const parts = relativeTimeParts(timestamp, now.value)
  switch (parts.unit) {
    case 'justNow':
      return t('recent.time.justNow')
    case 'minute':
      return t('recent.time.minute', { count: parts.value })
    case 'hour':
      return t('recent.time.hour', { count: parts.value })
    case 'day':
      return t('recent.time.day', { count: parts.value })
    case 'date':
      return new Date(parts.value).toLocaleDateString(locale.value)
    case 'earlier':
      return t('recent.time.earlier')
  }
}

function updatePosition(): void {
  const rect = buttonRef.value?.getBoundingClientRect()
  if (!rect) return
  left.value = Math.max(
    SAFE_MARGIN,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - SAFE_MARGIN)
  )
  top.value = rect.bottom + SAFE_MARGIN
}

function startRefresh(): void {
  stopRefresh()
  refreshTimer = setInterval(() => {
    now.value = Date.now()
  }, REFRESH_INTERVAL)
}

function stopRefresh(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function showMenu(): void {
  now.value = Date.now()
  updatePosition()
  open.value = true
  startRefresh()
}

function close(): void {
  open.value = false
  stopRefresh()
}

function toggle(): void {
  if (open.value) close()
  else showMenu()
}

function onSelectTab(id: string): void {
  docs.activateDocument(id)
  close()
}

function onOpenRecent(entry: RecentFileEntry): void {
  if (entry.missing) return
  close()
  void file.openRecentFile(entry)
}

function onClear(): void {
  void recent.clear()
}

function isInside(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false
  if (buttonRef.value?.contains(target)) return true
  return !!popoverRef.value?.contains(target)
}

function onPointerDown(event: MouseEvent): void {
  if (!open.value || isInside(event.target)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  document.addEventListener('mousedown', onPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
})

onBeforeUnmount(() => {
  stopRefresh()
  document.removeEventListener('mousedown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="tab-overview-btn"
    :class="{ active: open }"
    :title="t('recent.title')"
    :aria-label="t('recent.title')"
    :aria-expanded="open"
    aria-haspopup="menu"
    @click="toggle"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="popoverRef"
      class="tab-overview-popover"
      :class="{ light: app.resolvedTheme === 'light' }"
      :style="{ left: `${left}px`, top: `${top}px` }"
      role="menu"
      :aria-label="t('recent.title')"
    >
      <section class="overview-group">
        <div class="overview-group-title">{{ t('recent.sections.tabs') }}</div>
        <ul class="overview-list overview-tab-list">
          <li v-for="doc in docs.docs" :key="doc.id">
            <button
              type="button"
              class="overview-item"
              :class="{ active: doc.id === docs.activeId, missing: doc.missing }"
              :title="doc.path || doc.name"
              @click="onSelectTab(doc.id)"
            >
              <span class="overview-item-main">
                <span class="overview-item-name">{{ doc.name }}</span>
                <span v-if="doc.isModified" class="overview-dot" :title="t('tabs.unsaved')"></span>
              </span>
              <span class="overview-item-meta">
                <span class="overview-item-path">
                  {{
                    doc.missing
                      ? t('recent.missing')
                      : doc.path
                        ? directoryOf(doc.path)
                        : t('recent.unsaved')
                  }}
                </span>
                <span class="overview-item-time">{{ formatTime(doc.openedAt || now) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section class="overview-group">
        <div class="overview-group-title">
          <span>{{ t('recent.sections.files') }}</span>
          <button
            v-if="recent.entries.length > 0"
            type="button"
            class="overview-clear"
            @click="onClear"
          >
            {{ t('recent.clear') }}
          </button>
        </div>
        <ul v-if="otherEntries.length > 0" class="overview-list overview-recent-list">
          <li v-for="entry in otherEntries" :key="entry.path">
            <button
              type="button"
              class="overview-item"
              :class="{ missing: entry.missing }"
              :disabled="entry.missing"
              :title="entry.path"
              @click="onOpenRecent(entry)"
            >
              <span class="overview-item-main">
                <span class="overview-item-name">{{ entry.name }}</span>
              </span>
              <span class="overview-item-meta">
                <span class="overview-item-path">
                  {{ entry.missing ? t('recent.missing') : directoryOf(entry.path) }}
                </span>
                <span class="overview-item-time">{{ formatTime(entry.openedAt) }}</span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else class="overview-empty">{{ t('recent.emptyFiles') }}</div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tab-overview-btn {
  flex: 0 0 auto;
  align-self: flex-end;
  width: 28px;
  height: 30px;
  margin: 0 3px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tab-overview-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.tab-overview-btn.active {
  background: rgba(108, 155, 255, 0.14);
  color: #6c9bff;
}

:global(.light .tab-overview-btn) {
  color: rgba(0, 0, 0, 0.5);
}

:global(.light .tab-overview-btn:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

:global(.light .tab-overview-btn.active) {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.tab-overview-popover {
  position: fixed;
  z-index: 3000;
  width: 340px;
  max-height: min(480px, 72vh);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(30, 30, 42, 0.98);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  user-select: none;
  -webkit-app-region: no-drag;
}

.tab-overview-popover.light {
  border-color: rgba(0, 0, 0, 0.08);
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
}

.overview-group + .overview-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-overview-popover.light .overview-group + .overview-group {
  border-top-color: rgba(0, 0, 0, 0.07);
}

.overview-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 3px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.tab-overview-popover.light .overview-group-title {
  color: rgba(0, 0, 0, 0.38);
}

.overview-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.overview-item {
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
  cursor: default;
  transition: background 0.1s ease;
}

.overview-item:hover:not(:disabled) {
  background: rgba(108, 155, 255, 0.16);
  color: #fff;
}

.overview-item.active {
  background: rgba(108, 155, 255, 0.14);
  color: #fff;
}

.overview-item:focus-visible {
  outline: 2px solid rgba(108, 155, 255, 0.6);
  outline-offset: -2px;
}

.overview-item.missing,
.overview-item:disabled {
  color: rgba(255, 255, 255, 0.32);
}

.overview-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.overview-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.overview-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c9bff;
}

.overview-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.overview-item-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-item-time {
  flex-shrink: 0;
}

.overview-empty {
  padding: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

.overview-clear {
  border: none;
  padding: 2px 6px;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.overview-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.tab-overview-popover.light .overview-item {
  color: rgba(0, 0, 0, 0.78);
}

.tab-overview-popover.light .overview-item:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  color: #1a1a2e;
}

.tab-overview-popover.light .overview-item.active {
  background: rgba(59, 130, 246, 0.08);
  color: #1a1a2e;
}

.tab-overview-popover.light .overview-item.missing,
.tab-overview-popover.light .overview-item:disabled {
  color: rgba(0, 0, 0, 0.3);
}

.tab-overview-popover.light .overview-item-meta {
  color: rgba(0, 0, 0, 0.38);
}

.tab-overview-popover.light .overview-empty {
  color: rgba(0, 0, 0, 0.38);
}

.tab-overview-popover.light .overview-clear:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}
</style>
