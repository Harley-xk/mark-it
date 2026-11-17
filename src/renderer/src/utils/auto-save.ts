/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 自动保存间隔校验与保存条件判定
 */
import type { DocumentTab } from '../stores/documents'

/** 允许的自动保存间隔（秒）；0 表示关闭 */
export const AUTO_SAVE_INTERVALS = [0, 2, 5, 10] as const

/** 把任意持久化值归一化为受支持的间隔；非法值回落关闭 */
export function normalizeAutoSaveInterval(value: unknown): number {
  const seconds = typeof value === 'string' ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 0
  return (AUTO_SAVE_INTERVALS as readonly number[]).includes(seconds) ? seconds : 0
}

/** 持久化格式固定为十进制秒数 */
export function serializeAutoSaveInterval(seconds: number): string {
  return String(normalizeAutoSaveInterval(seconds))
}

/** 是否开启自动保存 */
export function isAutoSaveEnabled(interval: unknown): boolean {
  return normalizeAutoSaveInterval(interval) > 0
}

type AutoSaveDoc = Pick<DocumentTab, 'path' | 'isModified' | 'readOnly' | 'missing'>

/**
 * 单个标签自身是否满足自动保存条件：
 * 有磁盘路径、有未保存修改、编码可写回、文件未被外部删除。
 * 大文件 / 纯文本模式只关闭辅助能力，仍应正常保存。
 */
export function canAutoSave(doc: AutoSaveDoc | null | undefined): boolean {
  if (!doc) return false
  return !!doc.path && doc.isModified && !doc.readOnly && !doc.missing
}

/** 在自动保存开启的前提下，单个标签是否满足保存条件 */
export function shouldAutoSave(doc: AutoSaveDoc | null | undefined, interval: unknown): boolean {
  return isAutoSaveEnabled(interval) && canAutoSave(doc)
}
