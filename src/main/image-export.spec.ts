import { describe, expect, it } from 'vitest'
import {
  IMAGE_DEFAULT_SCALE,
  IMAGE_MAX_DIMENSION,
  createImageExportResult,
  ensureImageFileExtension,
  resolveImageCaptureScale
} from './image-export'

describe('长图截图倍率', () => {
  it('常规页面应使用请求的 2 倍截图', () => {
    expect(resolveImageCaptureScale(880, 2400, IMAGE_DEFAULT_SCALE)).toBe(2)
  })

  it('高度接近尺寸上限时应自动退回 1 倍', () => {
    expect(resolveImageCaptureScale(880, 20_000, IMAGE_DEFAULT_SCALE)).toBe(1)
  })

  it('1 倍仍超过单边尺寸上限时应拒绝导出', () => {
    expect(() =>
      resolveImageCaptureScale(880, IMAGE_MAX_DIMENSION + 1, IMAGE_DEFAULT_SCALE)
    ).toThrow('当前文档过长')
  })

  it('无效页面尺寸应拒绝导出', () => {
    expect(() => resolveImageCaptureScale(0, 1200, IMAGE_DEFAULT_SCALE)).toThrow('图片页面尺寸无效')
  })
})

describe('图片导出文件扩展名', () => {
  it('应与所选格式保持一致', () => {
    expect(ensureImageFileExtension('long-image.png', 'jpeg')).toBe('long-image.jpg')
    expect(ensureImageFileExtension('long-image.jpeg', 'jpeg')).toBe('long-image.jpeg')
    expect(ensureImageFileExtension('long-image.webp', 'png')).toBe('long-image.png')
    expect(ensureImageFileExtension('long-image', 'png')).toBe('long-image.png')
  })
})

describe('图片导出结果', () => {
  it('应按实际倍率计算输出像素尺寸', () => {
    expect(createImageExportResult('/tmp/a.jpg', 'jpeg', 2, 1, 1080, 2400)).toEqual({
      filePath: '/tmp/a.jpg',
      format: 'jpeg',
      requestedScale: 2,
      appliedScale: 1,
      pixelWidth: 1080,
      pixelHeight: 2400
    })
  })
})
