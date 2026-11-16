/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 主进程语言状态与消息翻译入口
 */
import type { Locale } from '../shared/locale-types'
import { resolveLocale, translate, type MessageKey, type MessageParams } from '../i18n'

let currentLocale: Locale = 'zh-CN'

/** app ready 之后用系统语言兜底；渲染进程同步后会覆盖 */
export function initMainLocale(systemLocale: string | null | undefined): void {
  currentLocale = resolveLocale(systemLocale)
}

export function setMainLocale(locale: Locale): void {
  currentLocale = locale
}

export function getMainLocale(): Locale {
  return currentLocale
}

export function mt(key: MessageKey, params?: MessageParams): string {
  return translate(currentLocale, key, params)
}
