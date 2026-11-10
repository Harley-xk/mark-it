import { describe, expect, it } from 'vitest'
import { parseWindowStateFile } from './window-state-store'

describe('多窗口几何状态', () => {
  it('应将旧版单窗口状态迁移给首个窗口', () => {
    const data = parseWindowStateFile(
      { width: 1200, height: 760, x: 40, y: 60, isMaximized: true, zoomFactor: 1.25 },
      'window-a'
    )
    expect(data?.windows['window-a']).toMatchObject({
      width: 1200,
      height: 760,
      x: 40,
      y: 60,
      isMaximized: true,
      zoomFactor: 1.3
    })
  })

  it('应夹取尺寸和缩放范围并保留合法窗口', () => {
    const data = parseWindowStateFile(
      {
        version: 2,
        windows: {
          a: { width: 500, height: 300, zoomFactor: 8 },
          broken: { width: 'wide' }
        }
      },
      'a'
    )
    expect(data?.windows.a.width).toBe(800)
    expect(data?.windows.a.height).toBe(600)
    expect(data?.windows.a.zoomFactor).toBe(3)
    expect(data?.windows.broken).toBeUndefined()
  })

  it('最后聚焦窗口不存在于结果中时应丢弃该字段', () => {
    const data = parseWindowStateFile({
      version: 2,
      windows: { a: { width: 1280, height: 800 } },
      lastFocusedWindowId: 'closed-window'
    })
    expect(data?.lastFocusedWindowId).toBeUndefined()
  })
})
