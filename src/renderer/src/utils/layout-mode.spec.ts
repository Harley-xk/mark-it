import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAYOUT_MODE,
  isLayoutMode,
  LAYOUT_MODES,
  loadSavedLayoutMode,
  saveLayoutMode
} from './layout-mode'

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

describe('布局模式校验', () => {
  it('应接受四种合法布局', () => {
    for (const mode of LAYOUT_MODES) expect(isLayoutMode(mode)).toBe(true)
  })

  it('应拒绝非法值与所有非字符串输入', () => {
    expect(isLayoutMode('foo')).toBe(false)
    expect(isLayoutMode('')).toBe(false)
    expect(isLayoutMode(null)).toBe(false)
    expect(isLayoutMode(undefined)).toBe(false)
    expect(isLayoutMode(1)).toBe(false)
    expect(isLayoutMode({ mode: 'edit-left' })).toBe(false)
  })
})

describe('markit-layout 读写', () => {
  it('应返回已保存的合法布局', () => {
    stubStorage({ 'markit-layout': 'preview-only' })
    expect(loadSavedLayoutMode()).toBe('preview-only')
  })

  it('缺失或非法时应回退默认布局', () => {
    stubStorage()
    expect(loadSavedLayoutMode()).toBe(DEFAULT_LAYOUT_MODE)
    stubStorage({ 'markit-layout': 'foo' })
    expect(loadSavedLayoutMode()).toBe(DEFAULT_LAYOUT_MODE)
  })

  it('保存时应写入 markit-layout 键', () => {
    const store = stubStorage()
    saveLayoutMode('edit-right')
    expect(store.get('markit-layout')).toBe('edit-right')
  })
})
