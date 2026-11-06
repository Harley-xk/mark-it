import { describe, expect, it } from 'vitest'
import { parseSessionData } from './session-store'

function sessionWith(tab: Record<string, unknown>): unknown {
  return { tabs: [{ content: '# 文档', ...tab }], activeIndex: 0 }
}

describe('会话滚动位置校验', () => {
  it('应保留合法的滚动位置，包括 0', () => {
    const data = parseSessionData(
      sessionWith({ scrollAnchor: 128, scrollTop: 240.5, previewScrollTop: 0 })
    )
    expect(data?.tabs[0].scrollAnchor).toBe(128)
    expect(data?.tabs[0].scrollTop).toBe(240.5)
    expect(data?.tabs[0].previewScrollTop).toBe(0)
  })

  it('负数、非数字与非有限值应归一为 undefined', () => {
    for (const value of [-1, '-5', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      const data = parseSessionData(
        sessionWith({ scrollAnchor: value, scrollTop: value, previewScrollTop: value })
      )
      expect(data?.tabs[0].scrollAnchor).toBeUndefined()
      expect(data?.tabs[0].scrollTop).toBeUndefined()
      expect(data?.tabs[0].previewScrollTop).toBeUndefined()
    }
  })

  it('缺失滚动字段时应保持 undefined，交由渲染进程按顶部兜底', () => {
    const data = parseSessionData(sessionWith({}))
    expect(data?.tabs[0].scrollAnchor).toBeUndefined()
    expect(data?.tabs[0].scrollTop).toBeUndefined()
    expect(data?.tabs[0].previewScrollTop).toBeUndefined()
  })
})

describe('会话布局字段校验', () => {
  it('应保留合法的 layoutMode', () => {
    const data = parseSessionData(sessionWith({ layoutMode: 'preview-only' }))
    expect(data?.tabs[0].layoutMode).toBe('preview-only')
  })

  it('非法 layoutMode 应归一为 undefined', () => {
    const data = parseSessionData(sessionWith({ layoutMode: 'foo' }))
    expect(data?.tabs[0].layoutMode).toBeUndefined()
  })

  it('缺失 layoutMode 时应保持 undefined，交由渲染进程兜底', () => {
    const data = parseSessionData(sessionWith({}))
    expect(data?.tabs[0].layoutMode).toBeUndefined()
  })
})
