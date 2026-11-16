/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 按界面语言选择内置使用手册内容
 */
import type { Locale } from '../../../shared/locale-types'
import zhCNManual from '../assets/welcome.md?raw'
import enUSManual from '../assets/welcome.en-US.md?raw'

/** 返回对应语言的内置手册；英文缺失时回退中文，避免欢迎页为空 */
export function manualContent(locale: Locale): string {
  return locale === 'en-US' ? enUSManual : zhCNManual
}
