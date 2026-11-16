/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 渲染进程响应式语言偏好：持久化、跨窗口同步与主进程语言同步
 */
import { computed, ref, watch } from 'vue'
import type { LocalePreference } from '../../../shared/locale-types'
import {
  isLocale,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams
} from '../../../i18n'

const STORAGE_KEY = 'markit-locale'

function loadPreference(): LocalePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // localStorage 不可用时退回跟随系统
  }
  return 'system'
}

function browserLanguage(): string {
  return typeof navigator === 'undefined' ? '' : navigator.language
}

const preference = ref<LocalePreference>(loadPreference())
const locale = computed<Locale>(() =>
  preference.value === 'system' ? resolveLocale(browserLanguage()) : preference.value
)

function t(key: MessageKey, params?: MessageParams): string {
  return translate(locale.value, key, params)
}

function syncMainProcess(): void {
  if (typeof window === 'undefined' || !window.api?.setLocale) return
  void window.api.setLocale(locale.value)
}

/** 修改语言偏好：立即写入 localStorage，并同步主进程与其他窗口 */
export function setLocalePreference(next: LocalePreference): void {
  const value: LocalePreference = next === 'system' || isLocale(next) ? next : 'system'
  preference.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch (err) {
    console.warn('Failed to save locale preference:', err)
  }
  syncMainProcess()
}

/** 其他窗口修改语言后通过 storage 事件同步 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && event.key !== STORAGE_KEY) return
    preference.value = loadPreference()
    syncMainProcess()
  })
}

// 各窗口在语言变化时同步 <html lang>；窗口标题由各入口自行维护
watch(
  locale,
  (value) => {
    if (typeof document !== 'undefined') document.documentElement.lang = value
    syncMainProcess()
  },
  { immediate: true }
)

export function useI18n(): {
  locale: Readonly<typeof locale>
  preference: Readonly<typeof preference>
  t: typeof t
  setLocalePreference: typeof setLocalePreference
} {
  return { locale, preference, t, setLocalePreference }
}
