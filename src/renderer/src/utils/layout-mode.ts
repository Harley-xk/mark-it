/*
 * 作者: Harley-xk
 * 创建: 2026-11-05
 *
 * 描述: 布局模式的枚举校验与 localStorage 读写，供 app 与 documents store 共用
 */
import type { LayoutMode } from '../types'

/** 四种布局的固定顺序，cycleLayout 的循环顺序与此一致 */
export const LAYOUT_MODES: LayoutMode[] = ['edit-left', 'edit-right', 'edit-only', 'preview-only']

export const DEFAULT_LAYOUT_MODE: LayoutMode = 'edit-left'

const STORAGE_KEY = 'markit-layout'

export function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === 'string' && (LAYOUT_MODES as string[]).includes(value)
}

/** 读取最近一次使用的布局；缺失或非法时回退 edit-left */
export function loadSavedLayoutMode(): LayoutMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return isLayoutMode(saved) ? saved : DEFAULT_LAYOUT_MODE
}

export function saveLayoutMode(mode: LayoutMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
}
