<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import appIconUrl from '@resources/icon.png'
import { useUpdateStore } from '../stores/update'

const update = useUpdateStore()
update.init()

const state = computed(() => update.state)
const isRollback = computed(() => state.value.isRollback === true)
const forced = computed(() => !isRollback.value && state.value.forceUpdate)
const isBeta = computed(() => state.value.latestChannel === 'beta')
const isDownloading = computed(() => state.value.status === 'downloading')
const isDownloaded = computed(() => state.value.status === 'downloaded')
const canDownload = computed(
  () =>
    state.value.status === 'available' ||
    (state.value.status === 'error' && !state.value.isRollback)
)
const notes = computed(() => state.value.notes?.trim() ?? '')

const percent = computed(() => Math.min(100, Math.max(0, state.value.progress?.percent ?? 0)))
const percentText = computed(() => `${Math.floor(percent.value)}%`)

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

const transferredText = computed(() => formatSize(state.value.progress?.transferred ?? 0))
const totalText = computed(() => formatSize(state.value.progress?.total ?? 0))
const speedText = computed(() => {
  const speed = state.value.progress?.bytesPerSecond ?? 0
  if (!speed) return ''
  return speed >= 1024 * 1024
    ? `${(speed / 1024 / 1024).toFixed(1)} MB/s`
    : `${Math.round(speed / 1024)} KB/s`
})

const downloadLabel = computed(() => {
  if (state.value.status === 'error') return '重新下载'
  return isRollback.value ? '下载回退版本' : '下载更新'
})

async function handleDownload(): Promise<void> {
  await update.download()
}

async function handleInstall(): Promise<void> {
  // 由主进程协调所有编辑窗口保存会话，随后退出安装
  await update.requestInstall()
}

function handleClose(): void {
  window.api.update.closeWindow()
}

// 与编辑窗口保持相同的主题；独立窗口无法共享 Pinia，从 localStorage / 系统主题读取
const theme = ref<'light' | 'dark'>('dark')
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(): void {
  const saved = localStorage.getItem('markit-theme')
  const dark = saved === 'dark' || (saved !== 'light' && mediaQuery.matches)
  theme.value = dark ? 'dark' : 'light'
}

resolveTheme()

onMounted(() => {
  mediaQuery.addEventListener('change', resolveTheme)
  // 编辑窗口切换主题时 localStorage 变化会同步到本窗口
  window.addEventListener('storage', resolveTheme)
})

onUnmounted(() => {
  mediaQuery.removeEventListener('change', resolveTheme)
  window.removeEventListener('storage', resolveTheme)
  update.dispose()
})
</script>

<template>
  <div class="update-window" :class="theme">
    <header class="window-header">
      <div class="window-title">
        <img class="brand-mark" :src="appIconUrl" alt="" aria-hidden="true" />
        <span>软件更新</span>
      </div>
      <button class="window-close" title="关闭" @click="handleClose">
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
    </header>

    <main class="window-body">
      <section class="version-hero">
        <span v-if="forced" class="force-badge">重要更新</span>
        <span v-if="isBeta" class="beta-badge">Beta</span>
        <h1>
          <template v-if="state.latestVersion">
            {{ isRollback ? '回退到正式版' : '发现新版本' }}
            <span class="version-number">v{{ state.latestVersion }}</span>
          </template>
          <template v-else>软件更新</template>
        </h1>
        <p v-if="state.currentVersion" class="current-version">
          当前版本 v{{ state.currentVersion
          }}<span v-if="state.currentChannel === 'beta'"> · Beta</span>
        </p>
      </section>

      <section class="notes-card">
        <div class="notes-title">更新内容</div>
        <div v-if="notes" class="notes-content">{{ notes }}</div>
        <div v-else class="notes-empty">该版本未提供更新说明。</div>
        <div v-if="isRollback" class="rollback-note">
          回退后当前 Beta 版本的新功能将不可用，并且不会自动回到 Beta。
        </div>
      </section>

      <section v-if="isDownloading || isDownloaded" class="progress-section">
        <div class="progress-header">
          <span>{{
            isDownloaded ? '下载完成' : isRollback ? '正在下载回退版本' : '正在下载更新'
          }}</span>
          <span v-if="!isDownloaded" class="progress-percent">{{ percentText }}</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :class="{ complete: isDownloaded }"
            :style="{ width: isDownloaded ? '100%' : percentText }"
          ></div>
        </div>
        <div v-if="!isDownloaded" class="progress-meta">
          <span>{{ transferredText }} / {{ totalText }}</span>
          <span>{{ speedText }}</span>
        </div>
        <p v-else class="progress-done">
          {{
            isRollback
              ? '回退版本已下载，重启应用即可完成回退。'
              : '新版本已下载，重启应用即可完成安装。'
          }}
        </p>
      </section>

      <p v-if="state.status === 'error'" class="error-text">
        {{ isRollback ? '回退失败' : '更新失败' }}：{{ state.error || '未知错误' }}
      </p>
      <p v-else-if="state.status === 'checking'" class="muted-text">
        {{ isRollback ? '正在查找可回退的正式版…' : '正在检查更新…' }}
      </p>
      <p v-else-if="state.status === 'not-available'" class="muted-text">当前已是最新版本。</p>
    </main>

    <footer class="window-footer">
      <button v-if="!forced" class="btn btn-ghost" @click="handleClose">稍后</button>
      <button v-if="canDownload" class="btn btn-primary" @click="handleDownload">
        {{ downloadLabel }}
      </button>
      <button v-else-if="isDownloaded" class="btn btn-primary" @click="handleInstall">
        {{ isRollback ? '立即重启回退' : '立即重启安装' }}
      </button>
      <button v-else-if="isDownloading" class="btn btn-primary" disabled>正在下载…</button>
    </footer>
  </div>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>

<style scoped>
.update-window {
  --bg: #1c1c27;
  --card: rgba(255, 255, 255, 0.035);
  --card-border: rgba(255, 255, 255, 0.08);
  --text: #e8e8ec;
  --text-muted: rgba(255, 255, 255, 0.48);
  --accent: #8fb4ff;
  --accent-soft: rgba(108, 155, 255, 0.16);
  --accent-border: rgba(108, 155, 255, 0.34);
  --track: rgba(255, 255, 255, 0.08);
  --danger: #ff7b72;
  --divider: rgba(255, 255, 255, 0.07);

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family:
    'Segoe UI',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
  user-select: none;
  overflow: hidden;
}

.update-window.light {
  --bg: #ffffff;
  --card: rgba(0, 0, 0, 0.025);
  --card-border: rgba(0, 0, 0, 0.08);
  --text: #1a1a2e;
  --text-muted: rgba(0, 0, 0, 0.5);
  --accent: #3b82f6;
  --accent-soft: rgba(59, 130, 246, 0.1);
  --accent-border: rgba(59, 130, 246, 0.25);
  --track: rgba(0, 0, 0, 0.08);
  --danger: #dc2626;
  --divider: rgba(0, 0, 0, 0.07);
}

/* ── 自定义标题栏 ── */
.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 10px 0 18px;
  border-bottom: 1px solid var(--divider);
  -webkit-app-region: drag;
  flex: 0 0 auto;
}

.window-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.brand-mark {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: contain;
}

.window-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.window-close:hover {
  background: var(--card);
  color: var(--text);
}

/* ── 内容区 ── */
.window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 26px 26px 20px;
}

.version-hero {
  margin-bottom: 22px;
}

.force-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #ffb020;
  background: rgba(255, 176, 32, 0.12);
  border: 1px solid rgba(255, 176, 32, 0.25);
}

.beta-badge {
  display: inline-block;
  margin-bottom: 10px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
}

.version-hero h1 {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0.2px;
}

.version-number {
  color: var(--accent);
}

.current-version {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.notes-card {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--card);
  border: 1px solid var(--card-border);
}

.notes-title {
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.notes-content {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.notes-empty {
  font-size: 12px;
  color: var(--text-muted);
}

.rollback-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--divider);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ── 下载进度 ── */
.progress-section {
  margin-top: 20px;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
}

.progress-percent {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 6px;
  border-radius: 3px;
  background: var(--track);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6c9bff, #8fb4ff);
  transition: width 0.2s ease;
}

.progress-fill.complete {
  background: #3ecf8e;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.progress-done {
  margin-top: 8px;
  font-size: 12px;
  color: #3ecf8e;
}

.error-text {
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--danger);
  word-break: break-all;
  user-select: text;
}

.muted-text {
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── 底部操作栏 ── */
.window-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 26px 20px;
  border-top: 1px solid var(--divider);
}

.btn {
  padding: 9px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn-primary:hover:not(:disabled) {
  background: rgba(108, 155, 255, 0.26);
}

.update-window.light .btn-primary:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.18);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-ghost {
  background: transparent;
  border-color: var(--card-border);
  color: var(--text-muted);
}

.btn-ghost:hover {
  background: var(--card);
  color: var(--text);
}

/* 滚动条 */
.window-body::-webkit-scrollbar,
.notes-content::-webkit-scrollbar {
  width: 8px;
}

.window-body::-webkit-scrollbar-thumb,
.notes-content::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.14);
}

.update-window.light .window-body::-webkit-scrollbar-thumb,
.update-window.light .notes-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.14);
}

.window-body::-webkit-scrollbar-thumb:hover,
.notes-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.26);
}

.update-window.light .window-body::-webkit-scrollbar-thumb:hover,
.update-window.light .notes-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.26);
}
</style>
