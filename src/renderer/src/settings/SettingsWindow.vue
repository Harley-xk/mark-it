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
import { useWindowZoom } from '../composables/useWindowZoom'
import { useGlobalZoom } from '../composables/useGlobalZoom'
import { AUTO_SAVE_INTERVALS } from '../utils/auto-save'
import type { ThemeMode } from '../types'
import type { Locale, LocalePreference } from '../../../shared/locale-types'
import { SUPPORTED_LOCALES, type MessageKey } from '../../../i18n'
import { useI18n } from '../i18n'
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
const { locale, preference, t, setLocalePreference } = useI18n()
const platform = window.api.platform
const activeTab = ref<SettingsTab>('appearance')
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const showRollbackConfirm = ref(false)
const exportingDiagnostics = ref(false)
const diagnosticsMessage = ref('')
const searchShortcutLabel = platform === 'darwin' ? '⌘ K' : 'Ctrl K'

const autoSaveOptions = computed(() =>
  AUTO_SAVE_INTERVALS.map((value) => ({
    value,
    label:
      value === 0
        ? t('settings.editor.autoSaveOff')
        : t('settings.editor.autoSaveSeconds', { seconds: value })
  }))
)

// 设置窗口与编辑窗口共享同一全局缩放，这里同步主进程广播的比例并提供操作入口
useWindowZoom()
const {
  percent: zoomPercent,
  atMin: zoomAtMin,
  atMax: zoomAtMax,
  presets: zoomPresets,
  percentOf: zoomPercentOf,
  setZoom,
  stepZoom,
  resetZoom
} = useGlobalZoom()

const tabs = computed<{ id: SettingsTab; label: string; icon: string }[]>(() => [
  { id: 'appearance', label: t('settings.tab.appearance'), icon: 'palette' },
  { id: 'editor', label: t('settings.tab.editor'), icon: 'layout' },
  { id: 'integration', label: t('settings.tab.integration'), icon: 'plug' },
  { id: 'updates', label: t('settings.tab.updates'), icon: 'refresh' },
  { id: 'about', label: t('settings.tab.about'), icon: 'info' }
])

const pageCopy = computed<Record<SettingsTab, { title: string; description: string }>>(() => ({
  appearance: {
    title: t('settings.tab.appearance'),
    description: t('settings.page.appearance.description')
  },
  editor: {
    title: t('settings.tab.editor'),
    description: t('settings.page.editor.description')
  },
  integration: {
    title: t('settings.tab.integration'),
    description: t('settings.page.integration.description')
  },
  updates: {
    title: t('settings.tab.updates'),
    description: t('settings.page.updates.description')
  },
  about: {
    title: t('settings.tab.about'),
    description: t('settings.page.about.description')
  }
}))

const searchEntries = computed<SearchEntry[]>(() => [
  {
    tab: 'appearance',
    label: t('settings.search.themeLabel'),
    hint: t('settings.search.themeHint'),
    keywords: t('settings.search.themeKeywords')
  },
  {
    tab: 'appearance',
    label: t('settings.search.languageLabel'),
    hint: t('settings.search.languageHint'),
    keywords: t('settings.search.languageKeywords')
  },
  {
    tab: 'appearance',
    label: t('settings.search.zoomLabel'),
    hint: t('settings.search.zoomHint'),
    keywords: t('settings.search.zoomKeywords')
  },
  {
    tab: 'editor',
    label: t('settings.search.styleLabel'),
    hint: t('settings.search.styleHint'),
    keywords: t('settings.search.styleKeywords')
  },
  {
    tab: 'editor',
    label: t('settings.search.cssLabel'),
    hint: t('settings.search.cssHint'),
    keywords: t('settings.search.cssKeywords')
  },
  {
    tab: 'editor',
    label: t('settings.search.widthLabel'),
    hint: t('settings.search.widthHint'),
    keywords: t('settings.search.widthKeywords')
  },
  {
    tab: 'editor',
    label: t('settings.search.autoSaveLabel'),
    hint: t('settings.search.autoSaveHint'),
    keywords: t('settings.search.autoSaveKeywords')
  },
  {
    tab: 'integration',
    label: t('settings.search.vscodeLabel'),
    hint: t('settings.search.vscodeHint'),
    keywords: t('settings.search.vscodeKeywords')
  },
  {
    tab: 'updates',
    label: t('settings.search.betaLabel'),
    hint: t('settings.search.betaHint'),
    keywords: t('settings.search.betaKeywords')
  },
  {
    tab: 'updates',
    label: t('settings.search.checkLabel'),
    hint: t('settings.search.checkHint'),
    keywords: t('settings.search.checkKeywords')
  },
  {
    tab: 'about',
    label: t('settings.search.aboutLabel'),
    hint: t('settings.search.aboutHint'),
    keywords: t('settings.search.aboutKeywords')
  },
  {
    tab: 'about',
    label: t('settings.search.diagnosticsLabel'),
    hint: t('settings.search.diagnosticsHint'),
    keywords: t('settings.search.diagnosticsKeywords')
  }
])

const currentPage = computed(() => pageCopy.value[activeTab.value])
const isDark = computed(() => app.resolvedTheme === 'dark')
const filteredSettings = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return searchEntries.value.filter((entry) =>
    `${entry.label} ${entry.hint} ${entry.keywords}`.toLowerCase().includes(query)
  )
})

const themeOptions = computed<{ value: ThemeMode; label: string; preview: string }[]>(() => [
  { value: 'system', label: t('settings.theme.system'), preview: 'system' },
  { value: 'light', label: t('settings.theme.light'), preview: 'light' },
  { value: 'dark', label: t('settings.theme.dark'), preview: 'dark' }
])

/** 新增语言时只需扩展 SUPPORTED_LOCALES 与对应标签消息 */
const LOCALE_LABEL_KEYS: Record<Locale, MessageKey> = {
  'zh-CN': 'settings.language.zh',
  'en-US': 'settings.language.en'
}

const languageOptions = computed<{ value: LocalePreference; label: string }[]>(() => [
  { value: 'system', label: t('settings.language.followSystem') },
  ...SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: t(LOCALE_LABEL_KEYS[locale])
  }))
])

const languageMenuOpen = ref(false)
const languageMenuRef = ref<HTMLElement | null>(null)
const currentLanguageLabel = computed(
  () => languageOptions.value.find((option) => option.value === preference.value)?.label ?? ''
)

const betaSuffix = computed(() =>
  update.state.latestChannel === 'beta' ? t('settings.updateStatus.betaSuffix') : ''
)
const showRollbackButton = computed(
  () => update.state.currentChannel === 'beta' && platform !== 'darwin'
)

const updateCheckStatus = computed(() => {
  const state = update.state
  switch (state.status) {
    case 'disabled':
      return t('settings.updateStatus.disabled')
    case 'idle':
      return t('settings.updateStatus.idle')
    case 'checking':
      return state.isRollback
        ? t('settings.updateStatus.checkingRollback')
        : t('settings.updateStatus.checking')
    case 'not-available':
      return t('settings.updateStatus.upToDate')
    case 'available':
      return state.isRollback
        ? t('settings.updateStatus.availableRollback', { version: state.latestVersion ?? '' })
        : t('settings.updateStatus.available', {
            version: state.latestVersion ?? '',
            betaSuffix: betaSuffix.value
          })
    case 'downloading':
      return state.isRollback
        ? t('settings.updateStatus.downloadingRollback')
        : t('settings.updateStatus.downloading')
    case 'downloaded':
      return state.isRollback
        ? t('settings.updateStatus.downloadedRollback')
        : t('settings.updateStatus.downloaded')
    case 'error':
      return state.isRollback
        ? t('settings.updateStatus.errorRollback', {
            error: state.error ?? t('updateWindow.unknownError')
          })
        : t('settings.updateStatus.error', {
            error: state.error ?? t('updateWindow.unknownError')
          })
    default:
      return ''
  }
})

const updateCheckButtonText = computed(() => {
  if (update.state.status === 'checking') return t('settings.updates.checking')
  if (update.state.status === 'error' && !update.state.isRollback)
    return t('settings.updates.retry')
  return t('settings.updates.check')
})

const rollbackActionText = computed(() => {
  if (update.state.status === 'error' && update.state.isRollback) {
    return t('settings.updates.rollbackRetry')
  }
  if (update.rollbackInProgress) return t('settings.updates.rollbackInProgress')
  return t('settings.updates.rollback')
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

async function handleCheckForUpdates(): Promise<void> {
  if (update.isBusy || update.rollbackInProgress || update.state.status === 'disabled') return
  await update.checkAndOpenIfAvailable()
}

async function handleBetaToggle(): Promise<void> {
  if (update.rollbackInProgress) return
  await update.setBetaEnabled(!update.state.betaUpdatesEnabled)
}

async function requestRollback(): Promise<void> {
  if (!update.canRollback) return
  if (update.state.status === 'error' && update.state.isRollback) {
    await update.rollbackToStable()
    if (update.hasUpdate) {
      await update.openWindow()
    }
    return
  }
  showRollbackConfirm.value = true
}

async function confirmRollback(): Promise<void> {
  showRollbackConfirm.value = false
  await update.rollbackToStable()
  if (update.hasUpdate) {
    await update.openWindow()
  }
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
      window.alert(
        t('settings.editor.cssTooLarge', {
          size: Math.floor(MAX_CUSTOM_STYLE_CHARS / 1000)
        })
      )
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

async function handleExportDiagnostics(): Promise<void> {
  if (exportingDiagnostics.value) return
  exportingDiagnostics.value = true
  diagnosticsMessage.value = ''
  try {
    const path = await window.api.exportDiagnostics()
    diagnosticsMessage.value = path
      ? t('settings.about.diagnosticsExported')
      : t('settings.about.diagnosticsCanceled')
  } catch (err) {
    console.error('Failed to export diagnostics:', err)
    diagnosticsMessage.value = t('settings.about.diagnosticsFailed')
  } finally {
    exportingDiagnostics.value = false
  }
}

function selectLanguage(value: LocalePreference): void {
  setLocalePreference(value)
  languageMenuOpen.value = false
}

/** 点击语言下拉以外的区域或按 Esc 时收起 */
function onLanguageMenuPointerDown(event: PointerEvent): void {
  if (!languageMenuOpen.value) return
  if (languageMenuRef.value?.contains(event.target as Node)) return
  languageMenuOpen.value = false
}

function onLanguageMenuKeydown(event: KeyboardEvent): void {
  if (!languageMenuOpen.value || event.key !== 'Escape') return
  event.stopPropagation()
  languageMenuOpen.value = false
}

watch(languageMenuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onLanguageMenuPointerDown, true)
    document.addEventListener('keydown', onLanguageMenuKeydown, true)
  } else {
    document.removeEventListener('pointerdown', onLanguageMenuPointerDown, true)
    document.removeEventListener('keydown', onLanguageMenuKeydown, true)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onLanguageMenuPointerDown, true)
  document.removeEventListener('keydown', onLanguageMenuKeydown, true)
})

// 窗口标题与页面语言跟随界面语言
watch(
  locale,
  (value) => {
    document.title = t('window.settingsTitle')
    document.documentElement.lang = value
  },
  { immediate: true }
)

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
        <span>{{ t('settings.titleShort') }}</span>
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
          :placeholder="t('settings.search.placeholder')"
          :aria-label="t('settings.search.placeholder')"
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
        <div v-if="filteredSettings.length === 0" class="search-empty">
          {{ t('settings.search.empty') }}
        </div>
      </div>

      <nav class="nav" :aria-label="t('settings.search.nav')">
        <div class="nav-group">
          <div class="nav-group-label">{{ t('settings.search.navApplication') }}</div>
          <button
            v-for="tab in tabs.slice(0, 2)"
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
          <div class="nav-group-label">{{ t('settings.search.navSystem') }}</div>
          <button
            v-for="tab in tabs.slice(2, 5)"
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
      </nav>
    </aside>

    <main class="settings-main">
      <header class="main-header">
        <div>
          <h1>{{ currentPage.title }}</h1>
          <p>{{ currentPage.description }}</p>
        </div>
      </header>

      <div class="content-scroll">
        <section v-if="activeTab === 'appearance'" class="panel">
          <div class="section">
            <div class="section-heading">
              <div>
                <h2>{{ t('settings.theme.title') }}</h2>
                <p>{{ t('settings.theme.description') }}</p>
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
              <span>{{ t('settings.theme.info') }}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>{{ t('settings.language.title') }}</h2>
                <p>{{ t('settings.language.description') }}</p>
              </div>
            </div>

            <div class="setting-card language-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.language.title') }}</h3>
                    <span class="status-badge">{{ t('settings.language.global') }}</span>
                  </div>
                  <p>{{ t('settings.language.hint') }}</p>
                </div>
                <div ref="languageMenuRef" class="language-select">
                  <button
                    class="language-trigger"
                    type="button"
                    :aria-label="t('settings.language.title')"
                    aria-haspopup="listbox"
                    :aria-expanded="languageMenuOpen"
                    @click="languageMenuOpen = !languageMenuOpen"
                  >
                    <span>{{ currentLanguageLabel }}</span>
                    <svg
                      class="language-chevron"
                      :class="{ open: languageMenuOpen }"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div
                    v-if="languageMenuOpen"
                    class="language-menu"
                    role="listbox"
                    :aria-label="t('settings.language.title')"
                  >
                    <button
                      v-for="option in languageOptions"
                      :key="option.value"
                      class="language-option"
                      :class="{ active: preference === option.value }"
                      type="button"
                      role="option"
                      :aria-selected="preference === option.value"
                      @click="selectLanguage(option.value)"
                    >
                      <span>{{ option.label }}</span>
                      <svg
                        v-if="preference === option.value"
                        class="language-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>{{ t('settings.zoom.title') }}</h2>
                <p>{{ t('settings.zoom.description') }}</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.zoom.label') }}</h3>
                    <span class="status-badge">{{ t('settings.zoom.global') }}</span>
                  </div>
                  <p>{{ t('settings.zoom.hint') }}</p>
                </div>
                <div class="zoom-stepper">
                  <button
                    class="zoom-step"
                    :disabled="zoomAtMin"
                    :title="t('settings.zoom.zoomOut')"
                    :aria-label="t('settings.zoom.zoomOut')"
                    @click="stepZoom(-1)"
                  >
                    −
                  </button>
                  <button class="zoom-value" :title="t('settings.zoom.reset')" @click="resetZoom">
                    {{ zoomPercent }}%
                  </button>
                  <button
                    class="zoom-step"
                    :disabled="zoomAtMax"
                    :title="t('settings.zoom.zoomIn')"
                    :aria-label="t('settings.zoom.zoomIn')"
                    @click="stepZoom(1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="zoom-preset-row">
                <span class="zoom-preset-label">{{ t('settings.zoom.quickSelect') }}</span>
                <div class="zoom-presets">
                  <button
                    v-for="factor in zoomPresets"
                    :key="factor"
                    class="zoom-preset"
                    :class="{ 'is-current': zoomPercent === zoomPercentOf(factor) }"
                    @click="setZoom(factor)"
                  >
                    {{ zoomPercentOf(factor) }}%
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'editor'" class="panel">
          <div class="section">
            <div class="section-heading">
              <div>
                <h2>{{ t('settings.editor.styleTitle') }}</h2>
                <p>{{ t('settings.editor.styleDescription') }}</p>
              </div>
              <button class="text-button" @click="handleFileImport">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 16V4M7 9l5-5 5 5"></path>
                  <path d="M5 15v4h14v-4"></path>
                </svg>
                {{ t('settings.editor.importCss') }}
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
                    {{
                      style.isBuiltin
                        ? t('settings.editor.builtinStyle')
                        : t('settings.editor.customCss')
                    }}
                  </span>
                </span>
                <span class="style-trailing">
                  <button
                    v-if="!style.isBuiltin"
                    class="remove-style"
                    :aria-label="t('settings.editor.removeStyle')"
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
                <h2>{{ t('settings.editor.widthTitle') }}</h2>
                <p>{{ t('settings.editor.widthDescription') }}</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.editor.widthMode') }}</h3>
                    <span class="status-badge">{{ t('settings.editor.widthGlobal') }}</span>
                  </div>
                  <p>{{ t('settings.editor.widthModeHint') }}</p>
                </div>
                <div class="mode-segment" :aria-label="t('settings.editor.widthMode')">
                  <button
                    :class="{ active: app.previewWidthMode === 'fixed' }"
                    @click="app.previewWidthMode = 'fixed'"
                  >
                    {{ t('settings.editor.widthFixed') }}
                  </button>
                  <button
                    :class="{ active: app.previewWidthMode === 'auto' }"
                    @click="app.previewWidthMode = 'auto'"
                  >
                    {{ t('settings.editor.widthAuto') }}
                  </button>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.editor.widthFixed') }}</h3>
                  </div>
                  <p>{{ t('settings.editor.widthFixedHint') }}</p>
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

          <div class="section">
            <div class="section-heading">
              <div>
                <h2>{{ t('settings.editor.autoSaveTitle') }}</h2>
                <p>{{ t('settings.editor.autoSaveDescription') }}</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.editor.autoSaveLabel') }}</h3>
                    <span class="status-badge">{{ t('settings.editor.autoSaveBadge') }}</span>
                  </div>
                  <p>{{ t('settings.editor.autoSaveHint') }}</p>
                </div>
                <div class="mode-segment" :aria-label="t('settings.editor.autoSaveLabel')">
                  <button
                    v-for="option in autoSaveOptions"
                    :key="option.value"
                    :class="{ active: app.autoSaveInterval === option.value }"
                    @click="app.setAutoSaveInterval(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
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
                <h2>{{ t('settings.updates.channelTitle') }}</h2>
                <p>{{ t('settings.updates.channelDescription') }}</p>
              </div>
            </div>

            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-copy">
                  <div class="setting-title-line">
                    <h3>{{ t('settings.updates.betaTitle') }}</h3>
                    <span class="status-badge warning">{{ t('settings.updates.betaBadge') }}</span>
                  </div>
                  <p>{{ t('settings.updates.betaDescription') }}</p>
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
                <h2>{{ t('settings.updates.statusTitle') }}</h2>
                <p>{{ t('settings.updates.statusDescription') }}</p>
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
                    <h3>{{ updateCheckStatus }}</h3>
                    <span
                      class="status-badge"
                      :class="{ success: update.state.currentChannel === 'stable' }"
                    >
                      {{ update.state.currentChannel === 'beta' ? 'Beta' : 'Stable' }}
                    </span>
                  </div>
                  <p>
                    {{
                      t('settings.updates.currentInstall', {
                        version: update.state.currentVersion ?? '',
                        channel:
                          update.state.currentChannel === 'beta'
                            ? t('settings.updates.betaVersion')
                            : t('settings.updates.stableVersion')
                      })
                    }}
                  </p>
                </div>
                <button
                  class="primary-button"
                  :disabled="
                    update.isBusy || update.rollbackInProgress || update.state.status === 'disabled'
                  "
                  @click="handleCheckForUpdates"
                >
                  {{ updateCheckButtonText }}
                </button>
              </div>
              <div
                v-if="showRollbackButton"
                class="rollback-row"
                :class="{ disabled: !update.canRollback }"
              >
                <div class="setting-copy">
                  <h3>{{ t('settings.updates.rollbackTitle') }}</h3>
                  <p>{{ t('settings.updates.rollbackDescription') }}</p>
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
          </div>
        </section>

        <section v-else class="panel">
          <div class="section">
            <div class="setting-card about-hero">
              <img :src="appIconUrl" :alt="t('settings.about.iconAlt')" />
              <div>
                <h2>MarkIt</h2>
                <p>{{ t('settings.about.heroDescription') }}</p>
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
                <h2>{{ t('settings.about.appInfo') }}</h2>
              </div>
            </div>

            <div class="setting-card about-rows">
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>{{ t('settings.about.updateChannel') }}</h3>
                  <p>
                    {{
                      update.state.betaUpdatesEnabled
                        ? t('settings.about.updateChannelOn')
                        : t('settings.about.updateChannelOff')
                    }}
                  </p>
                </div>
                <button class="link-button" @click="openSettingsTab('updates')">
                  {{ t('settings.about.manageUpdates') }}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>{{ t('settings.about.licenseTitle') }}</h3>
                  <p>{{ t('settings.about.licenseDescription') }}</p>
                </div>
                <button
                  class="link-button"
                  @click="openExternal('https://github.com/Harley-xk/mark-it/blob/master/LICENSE')"
                >
                  {{ t('settings.about.viewLicense') }}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>{{ t('settings.about.homepageTitle') }}</h3>
                  <p>{{ t('settings.about.homepageDescription') }}</p>
                </div>
                <button
                  class="link-button"
                  @click="openExternal('https://github.com/Harley-xk/mark-it')"
                >
                  {{ t('settings.about.openGithub') }}
                </button>
              </div>
              <div class="setting-row">
                <div class="setting-copy">
                  <h3>{{ t('settings.about.diagnosticsTitle') }}</h3>
                  <p>{{ t('settings.about.diagnosticsDescription') }}</p>
                </div>
                <div class="diagnostics-action">
                  <span v-if="diagnosticsMessage" class="diagnostics-message">
                    {{ diagnosticsMessage }}
                  </span>
                  <button
                    class="secondary-button"
                    :disabled="exportingDiagnostics"
                    @click="handleExportDiagnostics"
                  >
                    {{
                      exportingDiagnostics
                        ? t('settings.about.exportingDiagnostics')
                        : t('settings.about.exportDiagnostics')
                    }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>

    <ConfirmDialog
      :visible="showRollbackConfirm"
      :title="t('settings.updates.rollbackConfirmTitle')"
      :message="
        t('settings.updates.rollbackConfirmMessage', { version: update.state.currentVersion })
      "
      :save-text="t('settings.updates.rollbackConfirmSave')"
      :cancel-text="t('common.cancel')"
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
  /* Windows 默认使用微软雅黑，避免 Segoe UI 与中文回退字体混排显得发虚 */
  font-family:
    'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif;
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
  font-size: 12px;
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
  font-size: 13px;
}

.search-box input::placeholder {
  color: var(--text-faint);
}

.search-shortcut {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 600;
}

.search-result-hint,
.search-empty {
  color: var(--text-muted);
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 680;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.future-label {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--warning-bg);
  color: var(--warning);
  font-size: 12px;
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
  font-size: 13.5px;
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
  font-size: 12px;
  font-weight: 600;
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
  font-size: 13px;
  line-height: 1.6;
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
  font-size: 12px;
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
  font-size: 12.5px;
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
  font-size: 12px;
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
  min-height: 60px;
  padding: 12px 14px;
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
  font-size: 12px;
  line-height: 1.65;
}

.status-badge {
  padding: 2px 7px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 12px;
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
  font-size: 12px;
  cursor: pointer;
}

.mode-segment button.active {
  background: var(--raised-bg);
  color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

/* 下拉弹层需要溢出卡片边界，不能被 .setting-card 的 overflow: hidden 裁掉 */
.language-card {
  overflow: visible;
}

.language-select {
  position: relative;
  flex: 0 0 auto;
}

.language-trigger {
  min-width: 168px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--inset-bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.language-trigger:hover {
  border-color: var(--border-strong);
  background: var(--card-hover);
}

.language-trigger:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 1px;
}

.language-chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform 0.15s ease;
}

.language-chevron.open {
  transform: rotate(180deg);
}

.language-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  min-width: 100%;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
}

.language-option {
  width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 8px 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.language-option:hover {
  background: var(--card-hover);
  color: var(--text);
}

.language-option.active {
  color: var(--accent);
  font-weight: 600;
}

.language-check {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: var(--accent);
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
  font-size: 12px;
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
  font-size: 12.5px;
  font-weight: 600;
}

.style-description {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
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
  font-size: 12px;
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
  padding: 12px 14px;
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
  font-size: 12px;
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
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}

.rollback-row.disabled {
  opacity: 0.65;
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
  font-size: 12px;
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
  font-size: 12px;
}

.about-rows .setting-row {
  min-height: 57px;
}

.diagnostics-action {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.diagnostics-message {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.zoom-stepper {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.zoom-step,
.zoom-value {
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--inset-bg);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.zoom-step {
  width: 34px;
  font-size: 16px;
  line-height: 1;
}

.zoom-value {
  min-width: 76px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.zoom-step:hover:not(:disabled),
.zoom-value:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

.zoom-step:disabled {
  opacity: 0.4;
  cursor: default;
}

.zoom-preset-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 14px 12px;
}

.zoom-preset-label {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 12px;
}

.zoom-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.zoom-preset {
  min-width: 46px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}

.zoom-preset:hover {
  border-color: var(--accent-border);
  color: var(--text);
}

.zoom-preset.is-current {
  border-color: var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
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

  .zoom-stepper {
    width: 100%;
  }

  .zoom-value {
    flex: 1;
  }

  .zoom-preset-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
