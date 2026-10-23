<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/app'
import { useUpdateStore } from '../../stores/update'
import { useFile } from '../../composables/useFile'
import { confirmUnsaved } from '../../composables/useConfirmUnsaved'

const app = useAppStore()
const update = useUpdateStore()
const file = useFile()

const visible = computed(
  () =>
    update.showNotice &&
    (update.hasUpdate ||
      update.state.status === 'downloading' ||
      update.state.status === 'downloaded')
)
const forced = computed(() => update.state.forceUpdate && update.hasUpdate)

const percentText = computed(() => `${Math.floor(update.state.progress?.percent ?? 0)}%`)
const speedText = computed(() => {
  const speed = update.state.progress?.bytesPerSecond ?? 0
  if (!speed) return ''
  return `${(speed / 1024 / 1024).toFixed(1)} MB/s`
})

async function handleDownload(): Promise<void> {
  await update.download()
}

async function handleInstall(): Promise<void> {
  // 安装会重启应用，先处理未保存内容
  const action = await confirmUnsaved('安装更新', '当前文件有未保存的修改，是否保存后安装更新？')
  if (action === 'cancel') return
  if (action === 'save') await file.saveFile()
  await update.install()
}

function handleDismiss(): void {
  update.dismiss()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="update-fade">
      <!-- 强制更新：阻断式遮罩，不提供「稍后」 -->
      <div v-if="visible && forced" class="update-overlay">
        <div class="update-dialog" :class="app.resolvedTheme">
          <div class="update-header">
            <div class="update-badge">重要更新</div>
            <h3>发现新版本 v{{ update.state.latestVersion }}</h3>
            <p class="update-sub">
              当前版本 v{{ update.state.currentVersion }}，此版本需要立即更新
            </p>
          </div>

          <div v-if="update.state.notes" class="update-notes">{{ update.state.notes }}</div>

          <div v-if="update.state.status === 'downloading'" class="update-progress">
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: percentText }"></div>
            </div>
            <div class="progress-meta">
              <span>{{ percentText }}</span>
              <span>{{ speedText }}</span>
            </div>
          </div>

          <p v-if="update.state.status === 'error'" class="update-error">
            更新下载失败：{{ update.state.error }}
          </p>

          <div class="update-actions">
            <button
              v-if="update.state.status === 'available' || update.state.status === 'error'"
              class="btn btn-primary"
              @click="handleDownload"
            >
              {{ update.state.status === 'error' ? '重新下载' : '开始下载' }}
            </button>
            <button
              v-else-if="update.state.status === 'downloaded'"
              class="btn btn-primary"
              @click="handleInstall"
            >
              立即重启安装
            </button>
            <span v-else class="update-hint">正在准备更新…</span>
          </div>
        </div>
      </div>

      <!-- 普通更新：右下角提示卡片 -->
      <div v-else-if="visible" class="update-toast" :class="app.resolvedTheme">
        <div class="toast-header">
          <span class="toast-title">发现新版本 v{{ update.state.latestVersion }}</span>
          <button class="toast-close" title="稍后提醒" @click="handleDismiss">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p class="toast-sub">当前版本 v{{ update.state.currentVersion }}</p>
        <div v-if="update.state.notes" class="toast-notes">{{ update.state.notes }}</div>

        <div v-if="update.state.status === 'downloading'" class="update-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: percentText }"></div>
          </div>
          <div class="progress-meta">
            <span>{{ percentText }}</span>
            <span>{{ speedText }}</span>
          </div>
        </div>

        <p v-if="update.state.status === 'error'" class="update-error">
          下载失败：{{ update.state.error }}
        </p>

        <div class="toast-actions">
          <button class="btn btn-ghost" @click="handleDismiss">稍后</button>
          <button
            v-if="update.state.status === 'available' || update.state.status === 'error'"
            class="btn btn-primary"
            @click="handleDownload"
          >
            {{ update.state.status === 'error' ? '重试' : '下载更新' }}
          </button>
          <button
            v-else-if="update.state.status === 'downloaded'"
            class="btn btn-primary"
            @click="handleInstall"
          >
            重启安装
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}

.update-dialog {
  width: 440px;
  padding: 24px;
  border-radius: 14px;
  background: rgba(30, 30, 42, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  color: #e0e0e4;
}

.update-badge {
  display: inline-block;
  padding: 2px 8px;
  margin-bottom: 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #ffb020;
  background: rgba(255, 176, 32, 0.12);
  border: 1px solid rgba(255, 176, 32, 0.25);
}

.update-header h3 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 6px;
}

.update-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.update-notes,
.toast-notes {
  margin: 16px 0;
  max-height: 160px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.62);
  white-space: pre-wrap;
}

.update-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2500;
  width: 340px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(30, 30, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(20px);
  color: #e0e0e4;
}

.toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toast-title {
  font-size: 14px;
  font-weight: 600;
}

.toast-sub {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.toast-notes {
  margin: 12px 0;
  max-height: 96px;
  font-size: 12px;
}

.toast-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
}

.toast-close:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.update-progress {
  margin: 12px 0;
}

.progress-track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6c9bff, #8fb4ff);
  transition: width 0.2s ease;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.update-error {
  margin: 12px 0 0;
  font-size: 12px;
  color: #ff7b72;
  word-break: break-all;
}

.update-actions,
.toast-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.update-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.btn {
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.btn-primary {
  background: rgba(108, 155, 255, 0.15);
  border-color: rgba(108, 155, 255, 0.35);
  color: #8fb4ff;
}

.btn-primary:hover {
  background: rgba(108, 155, 255, 0.25);
}

.btn-ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.55);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

/* 浅色主题 */
.update-dialog.light,
.update-toast.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  color: #1a1a2e;
}

.update-dialog.light .update-sub,
.update-toast.light .toast-sub {
  color: rgba(0, 0, 0, 0.45);
}

.update-dialog.light .update-notes,
.update-toast.light .toast-notes {
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.62);
}

.update-toast.light .toast-close {
  color: rgba(0, 0, 0, 0.3);
}

.update-toast.light .toast-close:hover {
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.04);
}

.update-dialog.light .progress-track,
.update-toast.light .progress-track {
  background: rgba(0, 0, 0, 0.08);
}

.update-dialog.light .progress-meta,
.update-toast.light .progress-meta {
  color: rgba(0, 0, 0, 0.45);
}

.update-dialog.light .btn-ghost,
.update-toast.light .btn-ghost {
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.55);
}

.update-dialog.light .btn-ghost:hover,
.update-toast.light .btn-ghost:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.8);
}

.update-dialog.light .btn-primary,
.update-toast.light .btn-primary {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.update-fade-enter-active,
.update-fade-leave-active {
  transition: opacity 0.2s ease;
}

.update-fade-enter-from,
.update-fade-leave-to {
  opacity: 0;
}
</style>
