import { describe, expect, it } from 'vitest'
import { parseSessionData, parseSessionFile } from './session-store'

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
    expect(data?.tabs[0].previewScrollAnchor).toBeUndefined()
    expect(data?.tabs[0].previewScrollOffset).toBeUndefined()
  })

  it('应保留预览区内容锚点，偏移允许负数', () => {
    const data = parseSessionData(
      sessionWith({ previewScrollAnchor: 37, previewScrollOffset: -12.5 })
    )
    expect(data?.tabs[0].previewScrollAnchor).toBe(37)
    expect(data?.tabs[0].previewScrollOffset).toBe(-12.5)
  })

  it('预览锚点下标非法时归一为 undefined', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '3', null]) {
      const data = parseSessionData(sessionWith({ previewScrollAnchor: value }))
      expect(data?.tabs[0].previewScrollAnchor).toBeUndefined()
    }
  })

  it('预览锚点偏移非有限值时归一为 undefined', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '3', null]) {
      const data = parseSessionData(sessionWith({ previewScrollOffset: value }))
      expect(data?.tabs[0].previewScrollOffset).toBeUndefined()
    }
  })

  it('小数锚点下标向下取整，偏移保留原值', () => {
    const data = parseSessionData(
      sessionWith({ previewScrollAnchor: 1.7, previewScrollOffset: -3.2 })
    )
    expect(data?.tabs[0].previewScrollAnchor).toBe(1)
    expect(data?.tabs[0].previewScrollOffset).toBe(-3.2)
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

describe('会话大纲显隐字段校验', () => {
  it('应保留布尔类型的大纲显隐', () => {
    expect(parseSessionData(sessionWith({ outlineVisible: false }))?.tabs[0].outlineVisible).toBe(
      false
    )
    expect(parseSessionData(sessionWith({ outlineVisible: true }))?.tabs[0].outlineVisible).toBe(
      true
    )
  })

  it('非法大纲显隐应归一为 undefined', () => {
    for (const value of ['0', 'false', 0, 1, null]) {
      expect(parseSessionData(sessionWith({ outlineVisible: value }))?.tabs[0].outlineVisible).toBe(
        undefined
      )
    }
  })

  it('缺失大纲显隐时应保持 undefined，交由渲染进程兜底', () => {
    expect(parseSessionData(sessionWith({}))?.tabs[0].outlineVisible).toBeUndefined()
  })
})

describe('多窗口会话迁移', () => {
  it('应保留标签的稳定编辑历史 ID', () => {
    const data = parseSessionData(sessionWith({ historyId: 'history-a' }))
    expect(data?.tabs[0].historyId).toBe('history-a')
  })

  it('应将旧版单窗口会话迁移为一个窗口切片', () => {
    const data = parseSessionFile({
      tabs: [{ content: '# 旧会话', path: 'D:/docs/old.md' }],
      activeIndex: 0
    })
    expect(data?.version).toBe(2)
    expect(data?.windows).toHaveLength(1)
    expect(data?.windows[0].id).toBe('legacy')
    expect(data?.windows[0].tabs[0].path).toBe('D:/docs/old.md')
  })

  it('应保留 v2 中合法的多个窗口切片和最后聚焦窗口', () => {
    const data = parseSessionFile({
      version: 2,
      windows: [
        { id: 'window-a', tabs: [{ content: '# A' }], activeIndex: 0 },
        { id: 'window-b', tabs: [{ content: '# B' }], activeIndex: 0 }
      ],
      lastFocusedWindowId: 'window-b'
    })
    expect(data?.windows.map((window) => window.id)).toEqual(['window-a', 'window-b'])
    expect(data?.lastFocusedWindowId).toBe('window-b')
  })

  it('应丢弃损坏的窗口切片并保留合法窗口', () => {
    const data = parseSessionFile({
      version: 2,
      windows: [
        { id: 'valid', tabs: [{ content: '# 可用' }], activeIndex: 0 },
        { id: 'broken', tabs: 'not-an-array', activeIndex: 0 },
        { tabs: [{ content: '# 缺少 ID' }], activeIndex: 0 }
      ]
    })
    expect(data?.windows.map((window) => window.id)).toEqual(['valid'])
  })

  it('所有窗口都损坏时应返回 null，避免启动时创建空窗口切片', () => {
    expect(
      parseSessionFile({
        version: 2,
        windows: [{ id: 'broken', tabs: [], activeIndex: 0 }]
      })
    ).toBeNull()
  })
})
