import { describe, expect, it } from 'vitest'
import {
  buildTabDragPreviewHtml,
  escapeTabDragPreviewText,
  placeTabDragPreview,
  TAB_DRAG_PREVIEW_HEIGHT,
  TAB_DRAG_PREVIEW_OFFSET,
  TAB_DRAG_PREVIEW_WIDTH
} from './tab-drag-preview'

describe('标签拖拽悬浮提示内容', () => {
  it('应将文件名中的 HTML 特殊字符转义后再写入提示', () => {
    expect(escapeTabDragPreviewText(`<img src="x" onerror='alert(1)'>`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;'
    )

    const html = buildTabDragPreviewHtml(`<img src=x onerror=alert(1)>.md`, 'dark')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;.md')
    expect(html).not.toContain('<img src=x onerror=alert(1)>.md')
  })

  it('应保留标签名并输出对应的主题', () => {
    const dark = buildTabDragPreviewHtml('说明.md', 'dark')
    const light = buildTabDragPreviewHtml('说明.md', 'light')
    expect(dark).toContain('data-theme="dark"')
    expect(dark).toContain('说明.md')
    expect(light).toContain('data-theme="light"')
    expect(light).toContain('说明.md')
  })
})

describe('标签拖拽悬浮提示定位', () => {
  const size = { width: TAB_DRAG_PREVIEW_WIDTH, height: TAB_DRAG_PREVIEW_HEIGHT }
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

  it('应在光标右下方显示', () => {
    expect(placeTabDragPreview({ x: 400, y: 300 }, size, workArea)).toEqual({
      x: 400 + TAB_DRAG_PREVIEW_OFFSET,
      y: 300 + TAB_DRAG_PREVIEW_OFFSET
    })
  })

  it('靠近右侧和底部时应翻到光标左上方', () => {
    expect(placeTabDragPreview({ x: 1900, y: 1060 }, size, workArea)).toEqual({
      x: 1900 - size.width - TAB_DRAG_PREVIEW_OFFSET,
      y: 1060 - size.height - TAB_DRAG_PREVIEW_OFFSET
    })
  })

  it('应支持副屏工作区坐标并夹取到可见范围', () => {
    const secondary = { x: -1280, y: -200, width: 1280, height: 720 }
    expect(placeTabDragPreview({ x: -1300, y: -220 }, size, secondary)).toEqual({
      x: -1280,
      y: -200
    })
  })
})
