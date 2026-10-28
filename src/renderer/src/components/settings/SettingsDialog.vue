<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/app'
import { useStyleStore } from '../../stores/style'
import { useUpdateStore } from '../../stores/update'
import { useFile } from '../../composables/useFile'
import { flushSession } from '../../composables/useSession'
import { confirmUnsaved } from '../../composables/useConfirmUnsaved'
import type { ThemeMode } from '../../types'

const app = useAppStore()
const styleStore = useStyleStore()
const update = useUpdateStore()
const file = useFile()

const updateStatusText = computed(() => {
  const s = update.state
  switch (s.status) {
    case 'disabled':
      return '开发模式，不检测更新'
    case 'idle':
      return '尚未检测'
    case 'checking':
      return '正在检查更新…'
    case 'not-available':
      return '已是最新版本'
    case 'available':
      return `发现新版本 v${s.latestVersion}`
    case 'downloading':
      return `正在下载 ${Math.floor(s.progress?.percent ?? 0)}%`
    case 'downloaded':
      return `v${s.latestVersion} 已下载，重启后安装`
    case 'error':
      return `更新检查失败：${s.error ?? '未知错误'}`
    default:
      return ''
  }
})

async function handleUpdateAction(): Promise<void> {
  const status = update.state.status
  if (status === 'downloaded') {
    const action = await confirmUnsaved('安装更新', '当前文件有未保存的修改，是否保存后安装更新？')
    if (action === 'cancel') return
    if (action === 'save') await file.saveFile()
    // 更新会重启应用：先保存会话，重启后恢复原来的文档
    await flushSession()
    await update.install()
    return
  }
  if (status === 'available') {
    await update.download()
    return
  }
  // error 可能是检测失败，重新检测而不是直接下载
  await update.check()
}

const updateActionText = computed(() => {
  switch (update.state.status) {
    case 'downloaded':
      return '重启安装'
    case 'available':
      return '下载更新'
    case 'error':
      return '重试'
    case 'checking':
    case 'downloading':
      return '处理中…'
    default:
      return '检查更新'
  }
})

const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'system', label: '跟随系统', icon: 'monitor' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' }
]

const isDark = () => app.resolvedTheme === 'dark'

function handleFileImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.css'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const name = file.name.replace(/\.css$/i, '')
    styleStore.addCustomStyle({
      id: `custom-${Date.now()}`,
      name,
      css: text,
      isBuiltin: false
    })
  }
  input.click()
}

function removeStyle(id: string) {
  styleStore.removeCustomStyle(id)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="app.showSettingsDialog"
      class="settings-overlay"
      @click.self="app.showSettingsDialog = false"
    >
      <div class="settings-dialog" :class="app.resolvedTheme">
        <div class="dialog-header">
          <h3>设置</h3>
          <button class="dialog-close" @click="app.showSettingsDialog = false">
            <svg
              width="14"
              height="14"
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
        <div class="dialog-body">
          <!-- Theme -->
          <div class="setting-section">
            <div class="section-title">外观</div>
            <div class="theme-options">
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                class="theme-option"
                :class="{ active: app.themeMode === opt.value }"
                @click="app.setThemeMode(opt.value)"
              >
                <svg
                  v-if="opt.icon === 'sun'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <svg
                  v-else-if="opt.icon === 'moon'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <svg
                  v-else
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span>{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- Preview Style -->
          <div class="setting-section">
            <div class="section-title">预览样式</div>
            <div class="style-list">
              <div
                v-for="s in styleStore.allStyles(isDark())"
                :key="s.id"
                class="style-item"
                :class="{ active: styleStore.currentStyleId === s.id }"
                @click="styleStore.setStyle(s.id)"
              >
                <span class="style-name">{{ s.name }}</span>
                <button v-if="!s.isBuiltin" class="style-remove" @click.stop="removeStyle(s.id)">
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
              <button class="style-import" @click="handleFileImport">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>导入 CSS</span>
              </button>
            </div>
          </div>

          <!-- Preview Width -->
          <div class="setting-section">
            <div class="section-title">预览宽度</div>
            <div class="width-options">
              <button
                class="width-option"
                :class="{ active: app.previewWidthMode === 'fixed' }"
                @click="app.previewWidthMode = 'fixed'"
              >
                固定宽度
              </button>
              <button
                class="width-option"
                :class="{ active: app.previewWidthMode === 'auto' }"
                @click="app.previewWidthMode = 'auto'"
              >
                随容器自适应
              </button>
            </div>
            <div v-if="app.previewWidthMode === 'fixed'" class="width-input-row">
              <input
                v-model.number="app.previewWidth"
                class="width-slider"
                type="range"
                min="400"
                max="1600"
                step="20"
              />
              <span class="width-value">{{ app.previewWidth }} px</span>
            </div>
          </div>

          <!-- About & Update -->
          <div class="setting-section">
            <div class="section-title">关于</div>
            <div class="about-row">
              <div class="about-info">
                <span class="about-name">MarkIt</span>
                <span class="about-version">v{{ update.state.currentVersion }}</span>
              </div>
              <button
                class="update-btn"
                :disabled="update.isBusy || update.state.status === 'disabled'"
                @click="handleUpdateAction"
              >
                {{ updateActionText }}
              </button>
            </div>
            <div class="update-status" :class="{ 'is-error': update.state.status === 'error' }">
              {{ updateStatusText }}
            </div>
            <div v-if="update.state.notes && update.hasUpdate" class="update-notes">
              {{ update.state.notes }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-dialog {
  background: rgba(30, 30, 42, 0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  width: 420px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dialog-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e4;
}

.dialog-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.dialog-close:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.setting-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: rgba(255, 255, 255, 0.3);
}

/* Theme options */
.theme-options {
  display: flex;
  gap: 8px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-family: inherit;
  transition: all 0.15s ease;
}

.theme-option:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
}

.theme-option.active {
  background: rgba(108, 155, 255, 0.1);
  border-color: rgba(108, 155, 255, 0.3);
  color: #6c9bff;
}

/* Style list */
.style-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.style-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.style-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.style-item.active {
  background: rgba(108, 155, 255, 0.08);
}

.style-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.style-item.active .style-name {
  color: #6c9bff;
}

.style-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
}

.style-remove:hover {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.style-import {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  margin-top: 4px;
  transition: all 0.15s ease;
}

.style-import:hover {
  border-color: rgba(108, 155, 255, 0.3);
  color: rgba(255, 255, 255, 0.5);
  background: rgba(108, 155, 255, 0.04);
}

/* Preview width */
.width-options {
  display: flex;
  gap: 8px;
}

.width-option {
  flex: 1;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-family: inherit;
  transition: all 0.15s ease;
}

.width-option:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
}

.width-option.active {
  background: rgba(108, 155, 255, 0.1);
  border-color: rgba(108, 155, 255, 0.3);
  color: #6c9bff;
}

.width-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.width-slider {
  flex: 1;
  accent-color: #6c9bff;
}

.width-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* About & update */
.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.about-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.about-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.about-version {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
}

.update-btn {
  padding: 6px 12px;
  background: rgba(108, 155, 255, 0.12);
  border: 1px solid rgba(108, 155, 255, 0.3);
  border-radius: 7px;
  color: #8fb4ff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.update-btn:hover:not(:disabled) {
  background: rgba(108, 155, 255, 0.22);
}

.update-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.update-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.update-status.is-error {
  color: #ff7b72;
  word-break: break-all;
}

.update-notes {
  max-height: 120px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
  white-space: pre-wrap;
}

/* Light theme */
.settings-dialog.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.settings-dialog.light .dialog-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.settings-dialog.light .dialog-header h3 {
  color: #1a1a2e;
}

.settings-dialog.light .dialog-close {
  color: rgba(0, 0, 0, 0.3);
}

.settings-dialog.light .dialog-close:hover {
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.04);
}

.settings-dialog.light .section-title {
  color: rgba(0, 0, 0, 0.3);
}

.settings-dialog.light .theme-option {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.45);
}

.settings-dialog.light .theme-option:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
}

.settings-dialog.light .theme-option.active {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.settings-dialog.light .style-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.settings-dialog.light .style-item.active {
  background: rgba(59, 130, 246, 0.06);
}

.settings-dialog.light .style-name {
  color: rgba(0, 0, 0, 0.55);
}

.settings-dialog.light .style-item.active .style-name {
  color: #3b82f6;
}

.settings-dialog.light .style-remove {
  color: rgba(0, 0, 0, 0.15);
}

.settings-dialog.light .style-remove:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.06);
}

.settings-dialog.light .style-import {
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.3);
}

.settings-dialog.light .style-import:hover {
  border-color: rgba(59, 130, 246, 0.3);
  color: rgba(0, 0, 0, 0.5);
  background: rgba(59, 130, 246, 0.04);
}

.settings-dialog.light .width-option {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.45);
}

.settings-dialog.light .width-option:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
}

.settings-dialog.light .width-option.active {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.settings-dialog.light .width-value {
  color: rgba(0, 0, 0, 0.5);
}

.settings-dialog.light .about-row {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}

.settings-dialog.light .about-name {
  color: rgba(0, 0, 0, 0.65);
}

.settings-dialog.light .about-version,
.settings-dialog.light .update-status {
  color: rgba(0, 0, 0, 0.4);
}

.settings-dialog.light .update-btn {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.settings-dialog.light .update-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.16);
}

.settings-dialog.light .update-notes {
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.55);
}
</style>
