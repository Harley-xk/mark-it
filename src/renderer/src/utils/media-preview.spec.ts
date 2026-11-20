import { describe, expect, it } from 'vitest'
import { toLocalFileUrl } from './local-image'
import {
  anchoredScroll,
  centeredScroll,
  clampPreviewScale,
  computeFitScale,
  imageExtensionFromFileName,
  isRemoteImageSrc,
  suggestImageFileName,
  type PreviewGeometry
} from './media-preview'

function geometry(scale: number, overrides: Partial<PreviewGeometry> = {}): PreviewGeometry {
  return {
    width: 400,
    height: 300,
    viewportWidth: 600,
    viewportHeight: 400,
    scale,
    padding: 0,
    ...overrides
  }
}

describe('大图预览适应比例', () => {
  it('只缩小不放大', () => {
    expect(computeFitScale(400, 300, 1000, 800, 0)).toBe(1)
  })

  it('按视口宽高中更受限的一边缩小', () => {
    expect(computeFitScale(1600, 1200, 1000, 800, 0)).toBeCloseTo(0.625)
    expect(computeFitScale(1200, 1600, 1000, 800, 0)).toBeCloseTo(0.5)
  })

  it('扣除舞台留白', () => {
    expect(computeFitScale(1600, 1200, 1000, 800, 24)).toBeCloseTo(952 / 1600)
  })

  it('尺寸缺失时保持 100%', () => {
    expect(computeFitScale(0, 0, 1000, 800, 24)).toBe(1)
    expect(computeFitScale(400, 300, 20, 20, 24)).toBe(1)
  })
})

describe('大图预览锚点缩放', () => {
  it('以鼠标为锚点时指针下的内容保持不动', () => {
    const scroll = anchoredScroll(geometry(1), geometry(2), { x: 300, y: 200 }, { left: 0, top: 0 })
    expect(scroll).toEqual({ left: 100, top: 100 })
  })

  it('从放大状态缩小时同样保持锚点', () => {
    const scroll = anchoredScroll(
      geometry(2),
      geometry(1),
      { x: 300, y: 200 },
      { left: 100, top: 100 }
    )
    expect(scroll).toEqual({ left: 0, top: 0 })
  })

  it('小图居中缩放时不应跑到左上角', () => {
    const small = { width: 100, height: 100 }
    const scroll = anchoredScroll(
      geometry(1, small),
      geometry(2, small),
      { x: 300, y: 200 },
      { left: 0, top: 0 }
    )
    expect(scroll).toEqual({ left: 0, top: 0 })
  })

  it('结果应夹在可滚动范围内', () => {
    const scroll = anchoredScroll(geometry(2), geometry(4), { x: 10, y: 10 }, { left: 0, top: 0 })
    expect(scroll.left).toBeGreaterThanOrEqual(0)
    expect(scroll.top).toBeGreaterThanOrEqual(0)
    expect(scroll.left).toBeLessThanOrEqual(1600 - 600)
    expect(scroll.top).toBeLessThanOrEqual(1200 - 400)
  })
})

describe('大图预览居中滚动', () => {
  it('放大后应把图片放在视口中央', () => {
    expect(centeredScroll(geometry(2))).toEqual({ left: 100, top: 100 })
  })

  it('图片小于视口时滚动位置为 0', () => {
    expect(centeredScroll(geometry(1))).toEqual({ left: 0, top: 0 })
  })
})

describe('缩放范围', () => {
  it('应夹在 25%–400%', () => {
    expect(clampPreviewScale(0.01)).toBe(0.25)
    expect(clampPreviewScale(8)).toBe(4)
    expect(clampPreviewScale(1.5)).toBe(1.5)
  })
})

describe('预览图片文件名', () => {
  it('远程地址应去掉查询串并保留文件名', () => {
    expect(suggestImageFileName('https://example.com/a/b.png?x=1&y=2')).toBe('b.png')
  })

  it('本地协议应从 p 参数还原中文文件名', () => {
    expect(suggestImageFileName(toLocalFileUrl('D:/docs/图 1.png'))).toBe('图 1.png')
  })

  it('data URL 应按 MIME 推断扩展名', () => {
    expect(suggestImageFileName('data:image/jpeg;base64,AAAA')).toBe('image.jpg')
    expect(suggestImageFileName('data:image/png;base64,AAAA', 'photo-1')).toBe('photo-1.png')
  })

  it('地址中没有扩展名时补 png', () => {
    expect(suggestImageFileName('https://example.com/download')).toBe('download.png')
  })

  it('应剔除文件名中的非法字符', () => {
    expect(suggestImageFileName('https://example.com/%3Cbad%3E.png')).toBe('bad.png')
  })

  it('保存字节时按文件名校验扩展名', () => {
    expect(imageExtensionFromFileName('photo.JPEG')).toBe('jpeg')
    expect(imageExtensionFromFileName('archive.zip')).toBe('png')
  })

  it('应正确识别远程图片地址', () => {
    expect(isRemoteImageSrc('https://example.com/a.png')).toBe(true)
    expect(isRemoteImageSrc('HTTP://example.com/a.png')).toBe(true)
    expect(isRemoteImageSrc('markit-file://local/?p=D%3A%2Fa.png')).toBe(false)
    expect(isRemoteImageSrc('data:image/png;base64,AAAA')).toBe(false)
  })
})
