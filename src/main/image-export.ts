/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 长图截图的倍率选择、文件扩展名与像素尺寸结果
 */

import type { ImageExportFormat, ImageExportResult } from '../shared/image-types'

/** Chromium / Skia 对单张位图尺寸的保守上限 */
export const IMAGE_MAX_DIMENSION = 32_767
/** 单张长图的保守总像素预算，避免隐藏窗口在截图时耗尽内存 */
export const IMAGE_MAX_PIXELS = 80_000_000
export const IMAGE_DEFAULT_SCALE = 2

const IMAGE_FILE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i

export function imageExtensionFor(format: ImageExportFormat): 'png' | 'jpg' {
  return format === 'jpeg' ? 'jpg' : 'png'
}

/** 让保存路径与用户选择的图片格式保持一致，避免 JPEG 字节写入 .png */
export function ensureImageFileExtension(filePath: string, format: ImageExportFormat): string {
  const targetExtension = imageExtensionFor(format)
  const targetPattern = format === 'jpeg' ? /\.jpe?g$/i : /\.png$/i
  if (targetPattern.test(filePath)) return filePath
  if (IMAGE_FILE_EXTENSION.test(filePath)) {
    return filePath.replace(IMAGE_FILE_EXTENSION, `.${targetExtension}`)
  }
  return `${filePath || 'untitled'}.${targetExtension}`
}

function canCapture(width: number, height: number, scale: number): boolean {
  const pixelWidth = Math.ceil(width * scale)
  const pixelHeight = Math.ceil(height * scale)
  return (
    pixelWidth <= IMAGE_MAX_DIMENSION &&
    pixelHeight <= IMAGE_MAX_DIMENSION &&
    pixelWidth * pixelHeight <= IMAGE_MAX_PIXELS
  )
}

/**
 * 选择实际截图倍率：优先使用请求值，超过尺寸预算时退回 1 倍。
 * 1 倍仍超限时抛出明确错误，避免生成被裁切的残缺图片。
 */
export function resolveImageCaptureScale(
  width: number,
  height: number,
  requestedScale: number
): number {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(requestedScale)
  ) {
    throw new Error('图片页面尺寸无效，无法导出')
  }

  const preferredScale = Math.min(IMAGE_DEFAULT_SCALE, Math.max(1, requestedScale))
  if (canCapture(width, height, preferredScale)) return preferredScale
  if (preferredScale > 1 && canCapture(width, height, 1)) return 1

  throw new Error('当前文档过长，单张图片无法容纳，请缩短文档后重试')
}

export function createImageExportResult(
  filePath: string,
  format: ImageExportFormat,
  requestedScale: number,
  appliedScale: number,
  width: number,
  height: number
): ImageExportResult {
  return {
    filePath,
    format,
    requestedScale,
    appliedScale,
    pixelWidth: Math.ceil(width * appliedScale),
    pixelHeight: Math.ceil(height * appliedScale)
  }
}
