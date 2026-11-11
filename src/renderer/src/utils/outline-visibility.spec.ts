import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadSavedOutlineVisible,
  parseOutlineVisible,
  saveOutlineVisible
} from './outline-visibility'

/** 用最小假对象替代浏览器 localStorage，测试不依赖 DOM */
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value)
    }
  })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('大纲显隐兜底值解析', () => {
  it('应仅在历史值明确为 0 时视为隐藏', () => {
    expect(parseOutlineVisible('0')).toBe(false)
  })

  it('缺失、显示值与其他历史值都应视为显示', () => {
    for (const value of [null, '1', '', 'false']) {
      expect(parseOutlineVisible(value)).toBe(true)
    }
  })
})

describe('markit-show-outline 读写', () => {
  it('应读取最近一次保存的显隐状态', () => {
    stubStorage({ 'markit-show-outline': '0' })
    expect(loadSavedOutlineVisible()).toBe(false)
  })

  it('缺失时应默认显示', () => {
    stubStorage()
    expect(loadSavedOutlineVisible()).toBe(true)
  })

  it('保存时应写入约定的 1 / 0 值', () => {
    const store = stubStorage()
    saveOutlineVisible(false)
    expect(store.get('markit-show-outline')).toBe('0')
    saveOutlineVisible(true)
    expect(store.get('markit-show-outline')).toBe('1')
  })
})
