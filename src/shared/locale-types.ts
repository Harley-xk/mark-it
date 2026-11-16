/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 跨进程共享的界面语言纯类型
 */

/** 实际生效的界面语言 */
export type Locale = 'zh-CN' | 'en-US'

/** 用户在设置页选择的语言；system 表示跟随操作系统 */
export type LocalePreference = 'system' | Locale
