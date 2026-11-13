import { describe, expect, it } from 'vitest'
import {
  centerWindowOnWorkArea,
  parseWindowStateFile,
  placeWindowOnWorkArea
} from './window-state-store'

describe('多窗口几何状态', () => {
  it('应按释放点所在显示器放置新窗口并夹取到可用区域', () => {
    const placed = placeWindowOnWorkArea({ x: 1920, y: 0, width: 1920, height: 1080 }, 1280, 800, {
      x: 2500,
      y: 500
    })
    expect(placed).toEqual({ width: 1280, height: 800, x: 1920, y: 100 })
  })

  it('应将新窗口居中放在触发窗口所在显示器', () => {
    const placed = centerWindowOnWorkArea({ x: 1920, y: 0, width: 2560, height: 1440 }, 1040, 720)
    expect(placed).toEqual({ width: 1040, height: 720, x: 2680, y: 360 })
  })

  it('应支持负坐标显示器并夹取到小尺寸工作区', () => {
    expect(
      centerWindowOnWorkArea({ x: -1600, y: -200, width: 1600, height: 900 }, 1040, 720)
    ).toEqual({ width: 1040, height: 720, x: -1320, y: -110 })
    expect(centerWindowOnWorkArea({ x: 0, y: 0, width: 640, height: 480 }, 1040, 720)).toEqual({
      width: 640,
      height: 480,
      x: 0,
      y: 0
    })
  })

  it('应将旧版单窗口状态迁移给首个窗口，并把缩放提升为全局值', () => {
    const data = parseWindowStateFile(
      { width: 1200, height: 760, x: 40, y: 60, isMaximized: true, zoomFactor: 1.25 },
      'window-a'
    )
    expect(data?.version).toBe(3)
    expect(data?.zoomFactor).toBe(1.3)
    expect(data?.windows['window-a']).toMatchObject({
      width: 1200,
      height: 760,
      x: 40,
      y: 60,
      isMaximized: true
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
    expect(data?.windows.broken).toBeUndefined()
    expect(data?.zoomFactor).toBe(3)
  })

  it('v2 迁移应优先采用最后聚焦窗口的缩放比例', () => {
    const data = parseWindowStateFile({
      version: 2,
      windows: {
        a: { width: 1200, height: 800, zoomFactor: 1.5 },
        b: { width: 1200, height: 800, zoomFactor: 0.75 }
      },
      lastFocusedWindowId: 'b'
    })
    expect(data?.zoomFactor).toBe(0.8)
  })

  it('v3 应以顶层缩放为准并忽略残留的按窗口缩放', () => {
    const data = parseWindowStateFile({
      version: 3,
      zoomFactor: 1.4,
      windows: {
        a: { width: 1200, height: 800, zoomFactor: 2 }
      }
    })
    expect(data?.zoomFactor).toBe(1.4)
    expect(data?.windows.a).not.toHaveProperty('zoomFactor')
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
