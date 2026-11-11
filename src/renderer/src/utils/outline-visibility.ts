/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 大纲显隐兜底值的解析与 localStorage 读写，供 app 与 documents store 共用
 */

const STORAGE_KEY = 'markit-show-outline'

/** 仅历史约定的 '0' 表示隐藏；键缺失或其它值都按显示处理 */
export function parseOutlineVisible(value: string | null): boolean {
  return value !== '0'
}

/** 读取最近一次使用的大纲显隐，作为新标签、旧会话与无激活标签时的兜底 */
export function loadSavedOutlineVisible(): boolean {
  return parseOutlineVisible(localStorage.getItem(STORAGE_KEY))
}

export function saveOutlineVisible(visible: boolean): void {
  localStorage.setItem(STORAGE_KEY, visible ? '1' : '0')
}
