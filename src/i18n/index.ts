/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 跨进程共享的消息目录、语言解析与翻译纯函数
 */
import type { Locale } from '../shared/locale-types'
import { enUS } from './messages/en-US'
import { zhCN, type MessageKey } from './messages/zh-CN'

export type { Locale } from '../shared/locale-types'
export type { MessageKey } from './messages/zh-CN'

export type MessageParams = Record<string, string | number>

/** 未匹配到中文 / 英文时使用的回退语言 */
export const DEFAULT_LOCALE: Locale = 'en-US'
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-CN', 'en-US']

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

/** 校验任意输入是否为受支持的界面语言 */
export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en-US'
}

/**
 * 把浏览器 / 操作系统语言解析为受支持的界面语言。
 * 中文与英文按前缀匹配，其余语言回退英文。
 */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE
  const normalized = input.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('en')) return 'en-US'
  return DEFAULT_LOCALE
}

/**
 * 翻译单条消息。
 * - {name} 占位符按参数替换；缺少参数时保留原样，便于开发期发现遗漏。
 * - 英文单复数用 `单数|复数` 两段表示，`count === 1` 取第一段，其余取第二段。
 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const catalog = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE]
  const template = catalog[key] ?? MESSAGES[DEFAULT_LOCALE][key]
  if (!template) return key

  const variants = template.split('|')
  const text =
    variants.length > 1 && params?.count !== undefined
      ? variants[params.count === 1 ? 0 : 1]
      : template

  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params?.[name]
    return value === undefined ? match : String(value)
  })
}
