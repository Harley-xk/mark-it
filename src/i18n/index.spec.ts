import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  MESSAGES,
  SUPPORTED_LOCALES,
  isLocale,
  resolveLocale,
  translate
} from './index'

describe('resolveLocale', () => {
  it('应按语言前缀解析中文与英文', () => {
    expect(resolveLocale('zh-CN')).toBe('zh-CN')
    expect(resolveLocale('zh-TW')).toBe('zh-CN')
    expect(resolveLocale('en-US')).toBe('en-US')
    expect(resolveLocale('en-GB')).toBe('en-US')
  })

  it('未知或空语言应回退英文', () => {
    expect(DEFAULT_LOCALE).toBe('en-US')
    expect(resolveLocale('fr-FR')).toBe('en-US')
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE)
  })

  it('应识别受支持的语言值', () => {
    expect(SUPPORTED_LOCALES.every(isLocale)).toBe(true)
    expect(isLocale('zh')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('translate', () => {
  it('应替换占位符', () => {
    expect(translate('zh-CN', 'status.lineCol', { line: 3, column: 8 })).toBe('行 3, 列 8')
    expect(translate('en-US', 'status.lineCol', { line: 3, column: 8 })).toBe('Ln 3, Col 8')
  })

  it('缺少参数时保留占位符，便于开发期发现遗漏', () => {
    expect(translate('zh-CN', 'status.lineCol', { line: 3 })).toBe('行 3, 列 {column}')
  })

  it('应按 count 选择英文单复数', () => {
    expect(translate('en-US', 'file.moreFailures', { count: 1 })).toBe(
      '1 more file could not be opened.'
    )
    expect(translate('en-US', 'file.moreFailures', { count: 3 })).toBe(
      '3 more files could not be opened.'
    )
  })

  it('中文没有单复数分段时保持原文', () => {
    expect(translate('zh-CN', 'file.moreFailures', { count: 3 })).toBe('另有 3 个文件未能打开。')
  })

  it('两种语言的消息键应完全一致', () => {
    const zhKeys = Object.keys(MESSAGES['zh-CN']).sort()
    const enKeys = Object.keys(MESSAGES['en-US']).sort()
    expect(enKeys).toEqual(zhKeys)
  })
})
