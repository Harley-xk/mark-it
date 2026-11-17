import { describe, expect, it } from 'vitest'
import {
  isAutoSaveEnabled,
  normalizeAutoSaveInterval,
  serializeAutoSaveInterval,
  shouldAutoSave
} from './auto-save'

describe('normalizeAutoSaveInterval', () => {
  it('只接受允许的间隔值，其余回退关闭', () => {
    expect(normalizeAutoSaveInterval(0)).toBe(0)
    expect(normalizeAutoSaveInterval(2)).toBe(2)
    expect(normalizeAutoSaveInterval('5')).toBe(5)
    expect(normalizeAutoSaveInterval(3)).toBe(0)
    expect(normalizeAutoSaveInterval('abc')).toBe(0)
    expect(normalizeAutoSaveInterval(null)).toBe(0)
    expect(normalizeAutoSaveInterval(2.5)).toBe(0)
  })

  it('序列化时保持十进制秒数并归一化非法值', () => {
    expect(serializeAutoSaveInterval(10)).toBe('10')
    expect(serializeAutoSaveInterval(7)).toBe('0')
  })

  it('只有大于 0 的合法间隔才视为开启', () => {
    expect(isAutoSaveEnabled(2)).toBe(true)
    expect(isAutoSaveEnabled(0)).toBe(false)
    expect(isAutoSaveEnabled('nope')).toBe(false)
  })
})

describe('shouldAutoSave', () => {
  const doc = {
    path: 'D:/notes/a.md',
    isModified: true,
    readOnly: false,
    missing: false
  }

  it('满足条件时应自动保存', () => {
    expect(shouldAutoSave(doc, 2)).toBe(true)
  })

  it('关闭自动保存时不应触发', () => {
    expect(shouldAutoSave(doc, 0)).toBe(false)
  })

  it('未命名、已保存、只读或缺失的标签都不应自动保存', () => {
    expect(shouldAutoSave({ ...doc, path: null }, 2)).toBe(false)
    expect(shouldAutoSave({ ...doc, isModified: false }, 2)).toBe(false)
    expect(shouldAutoSave({ ...doc, readOnly: true }, 2)).toBe(false)
    expect(shouldAutoSave({ ...doc, missing: true }, 2)).toBe(false)
    expect(shouldAutoSave(null, 2)).toBe(false)
  })
})
