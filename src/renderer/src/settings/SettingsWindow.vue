<!--
  作者: Harley-xk
  创建: 2026-11-10

  描述: 独立设置窗口，提供分类导航、全局偏好、集成、更新与关于
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import appIconUrl from '@resources/icon.png'
import { MAX_CUSTOM_STYLE_CHARS, useStyleStore } from '../stores/style'
import { useAppStore } from '../stores/app'
import { useUpdateStore } from '../stores/update'
import type { ThemeMode } from '../types'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import VSCodeIntegration from '../components/settings/VSCodeIntegration.vue'

type SettingsTab = 'appearance' | 'editor' | 'integration' | 'updates' | 'about'

interface SearchEntry {
  tab: SettingsTab
  label: string
  hint: string
  keywords: string
}

const app = useAppStore()
const styleStore = useStyleStore()
const update = useUpdateStore()
const platform = window.api.platform
const activeTab = ref<SettingsTab>('appearance')
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const showRollbackConfirm = ref(false)
const searchShortcutLabel = platform === 'darwin' ? '⌘ K' : 'Ctrl K'

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'editor', label: '编辑与预览', icon: 'layout' },
  { id: 'integration', label: '编辑器集成', icon: 'plug' },
  { id: 'updates', label: '更新', icon: 'refresh' },
  { id: 'about', label: '关于', icon: 'info' }
]

const pageCopy: Record<SettingsTab, { title: string; description: string }> = {
  appearance: {
    title: '外观',
    description: '选择界面主题。更改会立即应用，并同步到所有 MarkIt 窗口。'
  },
  editor: {
    title: '编辑与预览',
    description: '调整预览样式和正文宽度，让 Markdown 的阅读体验更符合你的习惯。'
  },
  integration: {
    title: '编辑器集成',
    description: '把 MarkIt 接入常用的代码编辑器，在资源管理器中直接打开 Markdown 文件。'
  },
  updates: {
    title: '更新',
    description: '管理更新通道并检查新版本。安装前会先确认所有未保存的文档。'
  },
  about: {
    title: '关于',
    description: '当前版本、运行通道和 MarkIt 的基本信息。'
  }
}

const searchEntries: SearchEntry[] = [
  {
    tab: 'appearance',
    label: '主题模式',
    hint: '跟随系统、浅色或深色',
    keywords: 'theme system light dark 外观 深色 浅色'
  },
  {
    tab: 'editor',
    label: '预览样式',
    hint: 'GitHub、Dark、Academic、Minimal',
    keywords: 'preview style css 预览 样式'
  },
  {
    tab: 'editor',
    label: '导入自定义 CSS',
    hint: '为预览增加本地样式',
    keywords: 'preview custom css import 自定义'
  },
  {
    tab: 'editor',
    label: '预览宽度',
    hint: '固定宽度或自动适应',
    keywords: 'width preview 固定 自适应 宽度'
  },
  {
    tab: 'integration',
    label: 'VS Code 资源管理器',
    hint: '安装或卸载 MarkIt 扩展',
    keywords: 'vscode code integration 编辑器 集成'
  },
  {
    tab: 'updates',
    label: '接收 Beta 版更新',
    hint: '提前体验新功能',
    keywords: 'beta channel update 更新 通道'
  },
  {
    tab: 'updates',
    label: '检查更新',
    hint: '查看版本与下载状态',
    keywords: 'check update version 检查 版本'
  },
  {
    tab: 'about',
    label: '版本与项目信息',
    hint: '版本、许可证和项目主页',
    keywords: 'about version license github 关于 版本'
  }
]

const currentPage = computed(() => pageCopy[activeTab.value])
const isDark = computed(() => app.resolvedTheme === 'dark')
const filteredSettings = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return searchEntries.filter((entry) =>
    `${entry.label} ${entry.hint} ${entry.keywords}`.toLowerCase().includes(query)
  )
})

const themeOptions: { value: ThemeMode; label: string; preview: string }[] = [
  { value: 'system', label: '跟随系统', preview: 'system' },
  { value: 'light', label: '浅色', preview: 'light' },
  { value: 'dark', label: '深色', preview: 'dark' }
]

const betaSuffix = computed(() => (update.state.latestChannel === 'beta' ? '（Beta）' : ''))
const showRollbackButton = computed(
  () => update.state.currentChannel === 'beta' && platform !== 'darwin'
)

const updateStatusText = computed(() => {
  const state = update.state
  switch (state.status) {
    case 'disabled':
      return '开发模式，不检测更新'
    case 'idle':
      return '尚未检测'
    case 'checking':
      return state.isRollback ? '正在查找可回退的正式版…' : '正在检查更新…'
    case 'not-available':
      return '已是最新版本'
    case 'available':
      return state.isRollback
        ? `可回退到正式版 v${state.latestVersion}`
        : `发现新版本 v${state.latestVersion}${betaSuffix.value}`
    case 'downloading':
      return state.isRollback
        ? `正在下载回退版本 ${Math.floor(state.progress?.percent ?? 0)}%`
        : `正在下载 ${Math.floor(state.progress?.percent ?? 0)}%`
    case 'downloaded':
      return state.isRollback
        ? `v${state.latestVersion} 已下载，重启后回退`
        : `v${state.latestVersion} 已下载，重启后安装${betaSuffix.value}`
    case 'error':
      return state.isRollback
        ? `回退失败：${state.error ?? '未知错误'}`
        : `更新检查失败：${state.error ?? '未知错误'}`
    default:
      return ''
  }
})

const updateActionText = computed(() => {
  const rollback = update.state.isRollback === true
  switch (update.state.status) {
    case 'downloaded':
      return rollback ? '重启回退' : '重启安装'
    case 'available':
      return rollback ? '下载回退版本' : '下载更新'
    case 'error':
      return rollback ? '重试回退' : '重试'
    case 'checking':
    case 'downloading':
      return '处理中…'
    default:
      return '检查更新'
  }
})

const rollbackActionText = computed(() => {
  if (update.state.status === 'error' && update.state.isRollback) return '重试回退'
  if (update.rollbackInProgress) return '回退中…'
  return '回退到正式版'
})

function openSettingsTab(tab: SettingsTab): void {
  activeTab.value = tab
  searchQuery.value = ''
}

function openSearchResult(entry: SearchEntry): void {
  openSettingsTab(entry.tab)
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && filteredSettings.value[0]) {
    event.preventDefault()
    openSearchResult(filteredSettings.value[0])
  }
  if (event.key === 'Escape') {
    searchQuery.value = ''
    searchInput.value?.blur()
  }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}

async function handleUpdateAction(): Promise<void> {
  const status = update.state.status
  if (status === 'downloaded') {
    await update.requestInstall()
    return
  }
  if (status === 'error' && update.state.isRollback) {
    await update.rollbackToStable()
    return
  }
  if (status === 'available') {
    await update.download()
    return
  }
  await update.check()
}

async function handleBetaToggle(): Promise<void> {
  if (update.rollbackInProgress) return
  await update.setBetaEnabled(!update.state.betaUpdatesEnabled)
}

async function requestRollback(): Promise<void> {
  if (!update.canRollback) return
  if (update.state.status === 'error' && update.state.isRollback) {
    await update.rollbackToStable()
    return
  }
  showRollbackConfirm.value = true
}

async function confirmRollback(): Promise<void> {
  showRollbackConfirm.value = false
  await update.rollbackToStable()
}

function handleFileImport(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.css'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    if (text.length > MAX_CUSTOM_STYLE_CHARS) {
      window.alert(`CSS 文件过大，上限为 ${Math.floor(MAX_CUSTOM_STYLE_CHARS / 1000)} KB。`)
      return
    }
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

function removeStyle(event: MouseEvent, id: string): void {
  event.stopPropagation()
  styleStore.removeCustomStyle(id)
}

function openExternal(url: string): void {
  void window.api.openExternal(url)
}

watch(
  () => app.themeMode,
  (mode) => {
    void window.api.setNativeTheme(mode)
  },
  { immediate: true }
)

onMounted(() => {
  update.init()
  window.addEventListener('keydown', handleWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  update.dispose()
})
</script>

<template>
  <div class="settings-window" :class="app.resolvedTheme">
    <header class="window-titlebar" :class="platform">
      <div class="window-title">
        <img :src="appIconUrl" alt="" />
        <span>MarkIt</span>
        <span class="title-separator">/</span>
        <span>设置</span>
      </div>
    </header>

    <aside class="sidebar">
      <label class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-4-4"></path>
        </svg>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          placeholder="搜索设置"
          aria-label="搜索设置"
          @keydown="handleSearchKeydown"
        />
        <span class="search-shortcut">{{ searchShortcutLabel }}</span>
      </label>

      <div v-if="searchQuery.trim()" class="search-results">
        <button
          v-for="entry in filteredSettings"
          :key="`${entry.tab}-${entry.label}`"
          class="search-result"
          @click="openSearchResult(entry)"
        >
          <span class="search-result-label">{{ entry.label }}</span>
          <span class="search-result-hint">{{ entry.hint }}</span>
        </button>
        <div v-if="filteredSettings.length === 0" class="search-empty">没有找到匹配的设置</div>
      </div>

      <nav class="nav" aria-label="设置分类">
        <div class="nav-group">
          <div class="nav-group-label">应用</div>
          <button
            v-for="tab in tabs.slice(0, 3)"
            :key="tab.id"
            class="nav-item"
            :class="{ active: activeTab === tab.id }"
            @click="openSettingsTab(tab.id)"
          >
            <svg
              v-if="tab.icon === 'palette'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <path
                d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2a7 7 0 0 0 0-14h-2Z"
              ></path>
            </svg>
            <svg
              v-else-if="tab.icon === 'layout'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2"></rect>
              <path d="M9 4v16M9 10h12"></path>
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <path d="m8 12-3 3a4.2 4.2 0 0 0 6 6l3-3"></path>
              <path d="m16 12 3-3a4.2 4.2 0 0 0-6-6l-3 3"></path>
              <path d="m9 15 6-6"></path>
            </svg>
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">系统</div>
          <button
            v-for="tab in tabs.slice(3)"
            :key="tab.id"
            class="nav-item"
            :class="{ active: activeTab === tab.id }"
            @click="openSettingsTab(tab.id)"
          >
            <svg
              v-if="tab.icon === 'refresh'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <path d="M20 7v5h-5M4 17v-5h5"></path>
              <path d="M6.1 9a6 6 0 0 1 10.4-2L20 12"></path>
              <path d="M17.9 15a6 6 0 0 1-10.4 2L4 12"></path>
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 11v5M12 8h.01"></path>
            </svg>
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">
            <span>工作区</span>
            <span class="future-label">多窗口</span>
          </div>
          <button class="nav-item" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
              <rect x="3" y="4" width="18" height="16" rx="2"></rect>
              <path d="M3 9h18"></path>
            </svg>
            <span>窗口与标签</span>
            <span class="nav-spacer"></span>
            <span class="soon-badge">规划</span>
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="m8 12 2.6 2.6L16 9"></path>
        </svg>
        <span>更改会自动保存</span>
      </div>
    </aside>

    <main class="settings-main">
      <header class="main-header">
        <div>
          <div class="scope-line">
            <span class="scope-dot"></span>
            <span>全局设置</span>
          </div>
          <h1>{{ currentPage.title }}</h1>
          <p>{{ currentPage.description }}</p>
        </div>
        <div class="scope-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>
          </svg>
          <span>应用于所有窗口</span>
        </div>
      </header>

      <div class="content-scroll">
        <section v-if="activeTab === 'appearance'" class="panel">
          <div class="section">
            <div class="section-heading">
              <div>
                <h2>主题模式</h2>
                <p>界面、编辑器和预览会保持一致的主题方向。</p>
              </div>
            </div>

            <div class="theme-grid">
              <button
                v-for="option in themeOptions"
                :key="option.value"
                class="theme-card"
                :class="{ active: app.themeMode === option.value }"
                @click="app.setThemeMode(option.value)"
              >
                <div class="theme-preview" :class="option.preview">
                  <div class="preview-frame"></div>
                </div>
                <div class="theme-card-footer">
                  <span class="theme-card-name">{{ option.label }}</span>
                  <span class="selection-dot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="m5 12 4 4L19 6"></path>
                    </svg>
                  </span>
                </div>
              </button>
            </div>

            <div class="info-strip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M12 11v5M12 8h.01"></path>
              </svg>
              <span>
                “跟随系统”会随操作系统主题自动切换。这里的选择属于全局设置，多窗口打开时也会保持一致。
              </span>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'editor'" class="panel">
          <div class="section">
            <div class="section-heading">
              <div>
                <h2>预览样式</h2>
                <p>控制 Markdown 预览中的字体、间距、表格和代码块外观。</p>
              </div>
              <button class="text-button" @click="handleFileImport">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 16V4M7 9l5-5 5 5"></path>
                  <path d="M5 15v4h14v-4"></path>
                </svg>
                导入 CSS
              </button>
            </div>

            <div class="setting-card style-list">
              <div
                v-for="style in styleStore.allStyles(isDark)"
                :key="style.id"
                class="style-row"
                :class="{ selected: styleStore.currentStyleId === style.id }"
                role="button"
                tabindex="0"
                @click="styleStore.setStyle(style.id)"
                @keydown.enter="styleStore.setStyle(style.id)"
                @keydown.space.prevent="styleStore.setStyle(style.id)"
              >
                <span class="style-swatch" :class="style.id">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <span class="style-copy">
                  <span class="style-name">{{ style.name }}</span>
                  <span class="style-description">
                    {{ style.isBuiltin ? '内置预览样式' : '自定义 CSS' }}
                  </span>
                </span>
                <span class="style-trailing">
                  <button
                    v-if="!style.isBuiltin"
                    class="remove-style"
                    aria-label="删除自定义样式"
                    @click="removeStyle($event, style.id)"
                  >
                    ×
                  </button>
                  <span class="style-check">
                    <svg
                      v-if="styleStore.currentStyleId === style.id"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="m5 12 4 4L19 6"></path>
                    </svg>
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>预览宽度</h2>
                <p>固定宽度更适合阅读；自动模式会跟随当前预览区域伸缩。</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>正文宽度模式</h3>
                    <span class="status-badge">全局</span>
                  </div>
                  <p>多窗口场景下保持一致的正文阅读宽度。</p>
                </div>
                <div class="mode-segment" aria-label="正文宽度模式">
                  <button
                    :class="{ active: app.previewWidthMode === 'fixed' }"
                    @click="app.previewWidthMode = 'fixed'"
                  >
                    固定宽度
                  </button>
                  <button
                    :class="{ active: app.previewWidthMode === 'auto' }"
                    @click="app.previewWidthMode = 'auto'"
                  >
                    自动适应
                  </button>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>固定宽度</h3>
                  </div>
                  <p>建议在 720–960 px 之间，长段落更容易扫读。</p>
                </div>
                <div class="width-control" :class="{ disabled: app.previewWidthMode !== 'fixed' }">
                  <input
                    v-model.number="app.previewWidth"
                    type="range"
                    min="400"
                    max="1600"
                    step="20"
                    :disabled="app.previewWidthMode !== 'fixed'"
                  />
                  <div class="width-readout">
                    <span>400 px</span>
                    <span class="width-value">{{ app.previewWidth }} px</span>
                    <span>1600 px</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="width-visual" aria-hidden="true">
              <div
                class="width-page"
                :style="{
                  width:
                    app.previewWidthMode === 'fixed'
                      ? `${Math.min(92, Math.max(40, app.previewWidth / 14))}%`
                      : '78%'
                }"
              >
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'integration'" class="panel">
          <VSCodeIntegration :is-dark="isDark" />
        </section>

        <section v-else-if="activeTab === 'updates'" class="panel">
          <div class="section">
            <div class="section-heading">
              <div>
                <h2>更新通道</h2>
                <p>正式版更稳定；Beta 版会更早获得新功能，也可能出现回归问题。</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>接收 Beta 版更新</h3>
                    <span class="status-badge warning">实验特性</span>
                  </div>
                  <p>
                    关闭后仅接收正式版。当前 Beta
                    版本不会自动降级，并会在下一个正式版发布后自动归队。
                    如需立即退出，可使用“回退到正式版”。
                  </p>
                </div>
                <button
                  class="switch"
                  :class="{ on: update.state.betaUpdatesEnabled }"
                  role="switch"
                  :aria-checked="update.state.betaUpdatesEnabled"
                  :disabled="update.rollbackInProgress"
                  @click="handleBetaToggle"
                >
                  <span></span>
                </button>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>版本状态</h2>
                <p>安装更新前，MarkIt 会先逐个确认并保存所有未保存的文档。</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="update-summary">
                <span class="update-mark" :class="{ error: update.state.status === 'error' }">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path v-if="update.state.status === 'error'" d="M12 8v5M12 16h.01"></path>
                    <path v-else d="m8 12 2.6 2.6L16 9"></path>
                  </svg>
                </span>
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ updateStatusText }}</h3>
                    <span
                      class="status-badge"
                      :class="{ success: update.state.currentChannel === 'stable' }"
                    >
                      {{ update.state.currentChannel === 'beta' ? 'Beta' : 'Stable' }}
                    </span>
                  </div>
                  <p>
                    MarkIt v{{ update.state.currentVersion }} · 当前安装
                    {{ update.state.currentChannel === 'beta' ? 'Beta 版本' : '正式版本' }}
                  </p>
                </div>
                <button
                  class="primary-button"
                  :disabled="update.isBusy || update.state.status === 'disabled'"
                  @click="handleUpdateAction"
                >
                  {{ updateActionText }}
                </button>
              </div>
              <div
                v-if="showRollbackButton"
                class="rollback-row"
                :class="{ disabled: !update.canRollback }"
              >
                <div class="setting-copy">
                  <h3>退出 Beta 版本</h3>
                  <p>关闭 Beta 通道并下载当前最新的正式版。</p>
                </div>
                <button
                  class="secondary-button"
                  :disabled="!update.canRollback"
                  @click="requestRollback"
                >
                  {{ rollbackActionText }}
                </button>
              </div>
            </div>

            <div v-if="update.state.notes && update.hasUpdate" class="update-notes">
              <div class="update-notes-title">更新内容</div>
              <div class="update-notes-content">{{ update.state.notes }}</div>
            </div>
          </div>
        </section>

        <section v-else class="panel">
          <div class="section">
            <div class="setting-card about-hero">
              <img :src="appIconUrl" alt="MarkIt 图标" />
              <div>
                <h2>MarkIt</h2>
                <p>轻量、专注的本地 Markdown 编辑器</p>
                <div class="about-meta">
                  <span class="version-code">v{{ update.state.currentVersion }}</span>
                  <span
                    class="status-badge"
                    :class="{ success: update.state.currentChannel === 'stable' }"
                  >
                    {{ update.state.currentChannel === 'beta' ? 'Beta' : 'Stable' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>应用信息</h2>
              </div>
            </div>

            <div class="setting-card about-rows">
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>更新通道</h3>
                  <p>
                    {{
                      update.state.betaUpdatesEnabled
                        ? '同时接收 Beta 与正式版中较新的版本。'
                        : '当前只接收正式版更新。'
                    }}
                  </p>
                </div>
                <button class="link-button" @click="openSettingsTab('updates')">管理更新</button>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>开源许可</h3>
                  <p>MarkIt 以 MIT 许可证开源。</p>
                </div>
                <button
                  class="link-button"
                  @click="openExternal('https://github.com/Harley-xk/mark-it/blob/master/LICENSE')"
                >
                  查看许可证
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>项目主页</h3>
                  <p>获取使用手册、更新记录与问题反馈入口。</p>
                </div>
                <button
                  class="link-button"
                  @click="openExternal('https://github.com/Harley-xk/mark-it')"
                >
                  打开 GitHub
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>

    <ConfirmDialog
      :visible="showRollbackConfirm"
      title="回退到正式版"
      :message="`将关闭 Beta 更新并安装 stable 通道的当前最新正式版。当前 Beta 版本为 v${update.state.currentVersion}，回退后不会自动回到 Beta；下载完成后退出应用也会安装。是否继续？`"
      save-text="继续回退"
      cancel-text="取消"
      hide-discard
      primary-danger
      @save="confirmRollback"
      @cancel="showRollbackConfirm = false"
    />
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

body {
  font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
</style>

<style scoped>
.settings-window {
  --window-bg: #151922;
  --sidebar-bg: #10131a;
  --content-bg: #171b24;
  --card-bg: #1b202b;
  --card-hover: #202634;
  --inset-bg: #12161e;
  --raised-bg: #222938;
  --border: rgba(255, 255, 255, 0.075);
  --border-strong: rgba(255, 255, 255, 0.13);
  --text: #edf0f7;
  --text-secondary: #adb5c5;
  --text-muted: #7c8699;
  --text-faint: #5d6677;
  --accent: #83a9ff;
  --accent-strong: #5f8ef4;
  --accent-bg: rgba(92, 138, 244, 0.13);
  --accent-border: rgba(112, 154, 248, 0.3);
  --success: #72d7ae;
  --success-bg: rgba(86, 196, 150, 0.1);
  --success-border: rgba(86, 196, 150, 0.22);
  --warning: #e4b76b;
  --warning-bg: rgba(228, 183, 107, 0.1);
  --danger: #f07d86;
  --shadow: 0 10px 28px rgba(0, 0, 0, 0.2);

  width: 100%;
  height: 100vh;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr);
  grid-template-columns: 238px minmax(0, 1fr);
  overflow: hidden;
  background: var(--window-bg);
  color: var(--text);
}

.settings-window.light {
  --window-bg: #ffffff;
  --sidebar-bg: #f3f5f9;
  --content-bg: #ffffff;
  --card-bg: #f8f9fc;
  --card-hover: #f3f5fa;
  --inset-bg: #f1f3f8;
  --raised-bg: #ffffff;
  --border: rgba(22, 31, 51, 0.085);
  --border-strong: rgba(22, 31, 51, 0.14);
  --text: #1c2433;
  --text-secondary: #596477;
  --text-muted: #7e899b;
  --text-faint: #a0a9b7;
  --accent: #4778e8;
  --accent-strong: #315fca;
  --accent-bg: rgba(69, 116, 225, 0.09);
  --accent-border: rgba(69, 116, 225, 0.23);
  --success: #23845f;
  --success-bg: rgba(35, 132, 95, 0.08);
  --success-border: rgba(35, 132, 95, 0.18);
  --warning: #a66a12;
  --warning-bg: rgba(166, 106, 18, 0.08);
  --shadow: 0 10px 28px rgba(48, 60, 86, 0.08);
}

button,
input {
  font: inherit;
}

button {
  color: inherit;
}

.window-titlebar {
  grid-column: 1 / -1;
  height: 36px;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 148px 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--sidebar-bg);
  -webkit-app-region: drag;
  user-select: none;
}

.window-titlebar.darwin {
  padding-right: 14px;
  padding-left: 88px;
}

.window-titlebar.linux {
  padding-right: 14px;
}

.window-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.window-title img {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.title-separator {
  color: var(--text-faint);
}

.sidebar {
  grid-row: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
}

.search-box {
  position: relative;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 16px;
  padding: 0 9px 0 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--inset-bg);
  color: var(--text-muted);
}

.search-box:focus-within {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.search-box > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.search-box input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}

.search-box input::placeholder {
  color: var(--text-faint);
}

.search-shortcut {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-size: 9px;
}

.search-results {
  margin: -8px 4px 14px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
}

.search-result {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.search-result:hover {
  background: var(--card-hover);
}

.search-result + .search-result {
  border-top: 1px solid var(--border);
}

.search-result-label {
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
}

.search-result-hint,
.search-empty {
  color: var(--text-muted);
  font-size: 9.5px;
}

.search-empty {
  padding: 12px;
  text-align: center;
}

.nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 2px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.nav-group + .nav-group {
  margin-top: 18px;
}

.nav-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 7px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 680;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.future-label {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--warning-bg);
  color: var(--warning);
  font-size: 9px;
  letter-spacing: 0.03em;
}

.nav-item {
  width: 100%;
  height: 39px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.nav-item + .nav-item {
  margin-top: 2px;
}

.nav-item svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}

.nav-item:hover:not(:disabled) {
  background: var(--card-hover);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 620;
}

.nav-item:disabled {
  color: var(--text-faint);
  cursor: default;
  opacity: 0.7;
}

.nav-spacer {
  flex: 1;
}

.soon-badge {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 600;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 8px 4px;
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 10.5px;
}

.sidebar-footer svg {
  width: 14px;
  height: 14px;
  color: var(--success);
}

.settings-main {
  grid-row: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--content-bg);
}

.main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 38px 22px;
  border-bottom: 1px solid var(--border);
}

.scope-line {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.scope-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 4px var(--success-bg);
}

.main-header h1 {
  margin: 0;
  color: var(--text);
  font-size: 23px;
  font-weight: 680;
  letter-spacing: -0.02em;
}

.main-header p {
  margin: 7px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.scope-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 3px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--inset-bg);
  color: var(--text-secondary);
  font-size: 10.5px;
  white-space: nowrap;
}

.scope-pill svg {
  width: 13px;
  height: 13px;
  color: var(--accent);
}

.content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 38px 46px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.panel {
  width: min(100%, 720px);
}

.section + .section {
  margin-top: 30px;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 13px;
}

.section-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 660;
}

.section-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.55;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.theme-card {
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    transform 0.15s ease;
}

.theme-card:hover {
  border-color: var(--border-strong);
  background: var(--card-hover);
  transform: translateY(-1px);
}

.theme-card.active {
  border-color: var(--accent-border);
  box-shadow:
    0 0 0 1px var(--accent-border),
    0 8px 22px rgba(0, 0, 0, 0.12);
}

.theme-preview {
  position: relative;
  height: 72px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: #141720;
}

.theme-preview.light {
  border-color: rgba(22, 31, 51, 0.08);
  background: #ffffff;
}

.theme-preview.system {
  background: linear-gradient(90deg, #ffffff 0 50%, #141720 50% 100%);
}

.preview-frame {
  position: absolute;
  inset: 10px 9px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.035);
}

.theme-preview.light .preview-frame {
  background: #f3f5f9;
}

.preview-frame::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 9px;
  width: 34%;
  height: 5px;
  border-radius: 4px;
  background: #6c91ea;
}

.preview-frame::after {
  content: '';
  position: absolute;
  top: 21px;
  left: 9px;
  width: 64%;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow:
    0 9px 0 rgba(255, 255, 255, 0.09),
    0 18px 0 rgba(255, 255, 255, 0.07);
}

.theme-preview.light .preview-frame::after {
  background: rgba(22, 31, 51, 0.2);
  box-shadow:
    0 9px 0 rgba(22, 31, 51, 0.09),
    0 18px 0 rgba(22, 31, 51, 0.06);
}

.theme-preview.system .preview-frame {
  background: linear-gradient(90deg, #f3f5f9 0 49%, rgba(255, 255, 255, 0.035) 51% 100%);
}

.theme-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 2px 2px;
}

.theme-card-name {
  font-size: 11.5px;
  font-weight: 620;
}

.selection-dot {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  color: transparent;
}

.theme-card.active .selection-dot {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  color: #fff;
}

.selection-dot svg {
  width: 10px;
  height: 10px;
}

.info-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--inset-bg);
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.65;
}

.info-strip svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--accent);
}

.setting-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--card-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  min-height: 72px;
  padding: 16px 18px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--border);
}

.setting-copy {
  min-width: 0;
}

.setting-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-copy h3 {
  margin: 0;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 630;
}

.setting-copy p {
  max-width: 480px;
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.65;
}

.status-badge {
  padding: 2px 7px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 9px;
  font-weight: 650;
}

.status-badge.success {
  border-color: var(--success-border);
  background: var(--success-bg);
  color: var(--success);
}

.status-badge.warning {
  border-color: rgba(228, 183, 107, 0.2);
  background: var(--warning-bg);
  color: var(--warning);
}

.mode-segment {
  display: flex;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--inset-bg);
}

.mode-segment button {
  min-width: 56px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10.5px;
  cursor: pointer;
}

.mode-segment button.active {
  background: var(--raised-bg);
  color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.text-button,
.link-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: 620;
  white-space: nowrap;
  cursor: pointer;
}

.text-button svg {
  width: 14px;
  height: 14px;
}

.style-list {
  display: flex;
  flex-direction: column;
}

.style-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.style-row + .style-row {
  border-top: 1px solid var(--border);
}

.style-row:hover {
  background: var(--card-hover);
}

.style-swatch {
  width: 40px;
  height: 34px;
  flex: 0 0 auto;
  overflow: hidden;
  padding: 7px 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--inset-bg);
}

.style-swatch span {
  display: block;
  width: 100%;
  height: 3px;
  margin-bottom: 4px;
  border-radius: 999px;
  background: var(--text-muted);
  opacity: 0.42;
}

.style-swatch span:first-child {
  width: 68%;
  background: var(--accent);
  opacity: 0.8;
}

.style-swatch span:last-child {
  width: 52%;
  margin-bottom: 0;
}

.style-swatch.academic span:first-child {
  width: 48%;
}

.style-swatch.minimal span {
  height: 2px;
}

.style-copy {
  flex: 1;
  min-width: 0;
}

.style-name {
  color: var(--text);
  font-size: 11.5px;
  font-weight: 600;
}

.style-description {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 10px;
}

.style-trailing {
  display: flex;
  align-items: center;
  gap: 10px;
}

.style-row.selected .style-trailing {
  color: var(--accent);
}

.style-check {
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
}

.style-row.selected .style-check {
  border-color: var(--accent);
  color: var(--accent);
}

.style-check svg {
  width: 11px;
  height: 11px;
}

.remove-style {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}

.remove-style:hover {
  background: rgba(240, 125, 134, 0.12);
  color: var(--danger);
}

.width-control {
  width: 255px;
  flex: 0 0 auto;
}

.width-control.disabled {
  opacity: 0.45;
}

.width-readout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
  color: var(--text-faint);
  font-size: 9.5px;
}

.width-value {
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

input[type='range'] {
  width: 100%;
  height: 18px;
  margin: 4px 0 0;
  accent-color: var(--accent-strong);
  cursor: pointer;
}

input[type='range']:disabled {
  cursor: default;
}

.width-visual {
  position: relative;
  display: grid;
  place-items: center;
  height: 105px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background:
    linear-gradient(90deg, transparent 49.8%, var(--border) 50%, transparent 50.2%), var(--inset-bg);
}

.width-page {
  height: 76px;
  padding: 12px;
  border: 1px solid var(--accent-border);
  border-radius: 7px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
  transition: width 0.15s ease;
}

.width-page span {
  display: block;
  width: 38%;
  height: 5px;
  margin-bottom: 7px;
  border-radius: 999px;
  background: var(--accent);
  opacity: 0.74;
}

.width-page span:nth-child(n + 2) {
  width: 80%;
  height: 3px;
  background: var(--text-muted);
  opacity: 0.25;
}

.switch {
  position: relative;
  width: 39px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--inset-bg);
  cursor: pointer;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;
}

.switch.on {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.switch.on span {
  transform: translateX(17px);
  background: var(--accent);
}

.switch:disabled {
  opacity: 0.5;
  cursor: default;
}

.update-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 17px 18px;
}

.update-mark {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--success-border);
  border-radius: 11px;
  background: var(--success-bg);
  color: var(--success);
}

.update-mark.error {
  border-color: rgba(240, 125, 134, 0.2);
  background: rgba(240, 125, 134, 0.1);
  color: var(--danger);
}

.update-mark svg {
  width: 20px;
  height: 20px;
}

.update-summary .setting-copy {
  flex: 1;
}

.primary-button,
.secondary-button {
  min-height: 32px;
  padding: 0 13px;
  border-radius: 8px;
  font-size: 10.5px;
  font-weight: 620;
  white-space: nowrap;
  cursor: pointer;
}

.primary-button {
  border: 1px solid var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent);
}

.primary-button:hover:not(:disabled) {
  background: var(--card-hover);
}

.secondary-button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.rollback-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 18px;
  border-top: 1px solid var(--border);
}

.rollback-row.disabled {
  opacity: 0.65;
}

.update-notes {
  margin-top: 12px;
  padding: 13px 15px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--inset-bg);
}

.update-notes-title {
  margin-bottom: 7px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 650;
}

.update-notes-content {
  max-height: 120px;
  overflow-y: auto;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.about-hero {
  display: flex;
  align-items: center;
  gap: 17px;
  padding: 22px;
}

.about-hero img {
  width: 58px;
  height: 58px;
  border-radius: 14px;
  box-shadow: var(--shadow);
}

.about-hero h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.about-hero p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 10.5px;
}

.about-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
}

.version-code {
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 10px;
}

.about-rows .setting-row {
  min-height: 57px;
}

@media (max-width: 820px) {
  .settings-window {
    grid-template-columns: 205px minmax(0, 1fr);
  }

  .main-header {
    padding-right: 28px;
    padding-left: 28px;
  }

  .content-scroll {
    padding-right: 28px;
    padding-left: 28px;
  }

  .theme-grid {
    gap: 8px;
  }

  .setting-row {
    gap: 14px;
  }

  .width-control {
    width: 210px;
  }
}

@media (max-width: 650px) {
  .settings-window {
    display: flex;
    flex-direction: column;
  }

  .sidebar {
    flex: 0 0 auto;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .search-box,
  .sidebar-footer,
  .nav-group-label {
    display: none;
  }

  .nav {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 0;
  }

  .nav-group {
    display: contents;
  }

  .nav-item {
    width: auto;
    height: 32px;
    flex: 0 0 auto;
    padding: 0 10px;
  }

  .nav-item + .nav-item {
    margin-top: 0;
  }

  .nav-item svg,
  .soon-badge {
    display: none;
  }

  .nav-item:disabled {
    display: none;
  }

  .main-header {
    padding: 20px 22px 17px;
  }

  .main-header h1 {
    font-size: 20px;
  }

  .scope-pill {
    display: none;
  }

  .content-scroll {
    padding: 22px 22px 38px;
  }

  .theme-grid {
    grid-template-columns: 1fr;
  }

  .theme-preview {
    height: 58px;
  }

  .setting-row,
  .update-summary,
  .rollback-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .mode-segment,
  .width-control {
    width: 100%;
  }

  .mode-segment button {
    flex: 1;
  }

  .update-summary .primary-button {
    margin-left: 56px;
  }
}
</style>
