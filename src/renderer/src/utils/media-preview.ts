/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 大图预览窗口的缩放几何、图片文件名与来源判定纯函数
 */
import type { ImageFileExtension } from '../../../shared/image-types'

/** 缩放范围与步长，图表与图片共用 */
export const PREVIEW_MIN_SCALE = 0.25
export const PREVIEW_MAX_SCALE = 4
export const PREVIEW_ZOOM_STEP = 1.25
/** 舞台四周留白（每侧像素） */
export const PREVIEW_PADDING = 24

export interface PreviewGeometry {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  scale: number
  padding: number
}

export interface PreviewPoint {
  x: number
  y: number
}

export interface PreviewScroll {
  left: number
  top: number
}

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set<ImageFileExtension>([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'ico',
  'tif',
  'tiff'
])

const IMAGE_EXTENSION_BY_MIME: Record<string, ImageFileExtension> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff'
}

export function clampPreviewScale(value: number): number {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, value))
}

/** 完整放入视口所需的缩放比例；只缩小不放大 */
export function computeFitScale(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = PREVIEW_PADDING
): number {
  const availableWidth = viewportWidth - padding * 2
  const availableHeight = viewportHeight - padding * 2
  if (imageWidth <= 0 || imageHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return 1
  }
  return Math.min(1, availableWidth / imageWidth, availableHeight / imageHeight)
}

interface StageGeometry {
  stageWidth: number
  stageHeight: number
  offsetX: number
  offsetY: number
}

function stageGeometry(geometry: PreviewGeometry): StageGeometry {
  const scaledWidth = geometry.width * geometry.scale
  const scaledHeight = geometry.height * geometry.scale
  const stageWidth = Math.max(geometry.viewportWidth, scaledWidth + geometry.padding * 2)
  const stageHeight = Math.max(geometry.viewportHeight, scaledHeight + geometry.padding * 2)
  return {
    stageWidth,
    stageHeight,
    offsetX: (stageWidth - scaledWidth) / 2,
    offsetY: (stageHeight - scaledHeight) / 2
  }
}

function clampScroll(value: number, stageSize: number, viewportSize: number): number {
  return Math.min(Math.max(0, stageSize - viewportSize), Math.max(0, value))
}

/** 图片居中时的滚动位置 */
export function centeredScroll(geometry: PreviewGeometry): PreviewScroll {
  const stage = stageGeometry(geometry)
  return {
    left: clampScroll(
      (stage.stageWidth - geometry.viewportWidth) / 2,
      stage.stageWidth,
      geometry.viewportWidth
    ),
    top: clampScroll(
      (stage.stageHeight - geometry.viewportHeight) / 2,
      stage.stageHeight,
      geometry.viewportHeight
    )
  }
}

/**
 * 以指针为锚点缩放：缩放前后指针指向的图片内容保持不动。
 * 视口尺寸变化（滚动条出现 / 消失）时传入缩放后的新尺寸。
 */
export function anchoredScroll(
  before: PreviewGeometry,
  after: PreviewGeometry,
  pointer: PreviewPoint,
  scroll: PreviewScroll
): PreviewScroll {
  const from = stageGeometry(before)
  const contentX = (scroll.left + pointer.x - from.offsetX) / before.scale
  const contentY = (scroll.top + pointer.y - from.offsetY) / before.scale

  const to = stageGeometry(after)
  return {
    left: clampScroll(
      contentX * after.scale + to.offsetX - pointer.x,
      to.stageWidth,
      after.viewportWidth
    ),
    top: clampScroll(
      contentY * after.scale + to.offsetY - pointer.y,
      to.stageHeight,
      after.viewportHeight
    )
  }
}

export function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 取地址中的文件名；markit-file 协议从 p 参数还原绝对路径的文件名 */
function fileNameFromSrc(src: string): string {
  const value = src.trim()
  if (!value || /^data:/i.test(value)) return ''

  if (/^markit-file:/i.test(value)) {
    try {
      const rawPath = new URL(value).searchParams.get('p')
      if (rawPath) return rawPath.split(/[\\/]/).pop() ?? ''
    } catch {
      return ''
    }
    return ''
  }

  try {
    return safeDecode(new URL(value, 'http://localhost').pathname.split(/[\\/]/).pop() ?? '')
  } catch {
    return safeDecode(value.split(/[?#]/, 1)[0].split(/[\\/]/).pop() ?? '')
  }
}

/** 从文件名或地址中提取图片扩展名；非图片扩展名返回 null */
export function imageExtensionOf(value: string): ImageFileExtension | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(safeDecode(value).trim())
  if (!match) return null
  const extension = match[1].toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) ? (extension as ImageFileExtension) : null
}

function imageExtensionFromDataUrl(src: string): ImageFileExtension | null {
  const match = /^data:([^;,]+)[;,]/.exec(src.trim())
  if (!match) return null
  return IMAGE_EXTENSION_BY_MIME[match[1].toLowerCase()] ?? null
}

function sanitizeFileName(name: string): string {
  return (
    name
      // 控制字符在文件名中非法，这里需要显式匹配
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 120)
  )
}

/**
 * 生成保存对话框的默认文件名。
 * fallbackBase 用于地址中无法取得文件名时（例如 data URL），由调用方提供。
 */
export function suggestImageFileName(src: string, fallbackBase = 'image'): string {
  const rawName = fileNameFromSrc(src)
  const extension =
    imageExtensionOf(rawName) ?? imageExtensionFromDataUrl(src) ?? imageExtensionOf(src) ?? 'png'
  const base = sanitizeFileName(rawName.replace(/\.[a-zA-Z0-9]+$/, '')) || fallbackBase
  return `${base}.${extension}`
}

/** 保存字节时使用的扩展名：未知时退回 png */
export function imageExtensionFromFileName(name: string): ImageFileExtension {
  return imageExtensionOf(name) ?? 'png'
}
