/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 远程预览图片下载的地址校验、扩展名推断与体积常量
 */
import type { ImageFileExtension } from '../shared/image-types'

/** 下载超时：避免不可达地址长时间占用主进程 */
export const REMOTE_IMAGE_TIMEOUT_MS = 30_000
/** 单个远程图片的最大体积 */
export const REMOTE_IMAGE_MAX_BYTES = 64 * 1024 * 1024

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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 只接受 http / https 的远程图片地址 */
export function parseRemoteImageUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** 从文件名或路径中提取图片扩展名；非图片扩展名返回 null */
export function imageExtensionOf(value: string): ImageFileExtension | null {
  const path = safeDecode(value.split(/[?#]/, 1)[0])
  const match = /\.([a-zA-Z0-9]+)$/.exec(path)
  if (!match) return null
  const extension = match[1].toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) ? (extension as ImageFileExtension) : null
}

export function imageExtensionFromContentType(
  contentType: string | null
): ImageFileExtension | null {
  if (!contentType) return null
  const mime = contentType.split(';', 1)[0].trim().toLowerCase()
  return IMAGE_EXTENSION_BY_MIME[mime] ?? null
}

/**
 * 决定保存对话框使用的扩展名。
 * 优先用户给出的文件名，其次响应类型，最后地址本身；都无法判断时按 png 处理。
 */
export function resolveImageDownloadExtension(
  fileName: string,
  url: URL,
  contentType: string | null
): ImageFileExtension {
  return (
    imageExtensionOf(fileName) ??
    imageExtensionFromContentType(contentType) ??
    imageExtensionOf(url.pathname) ??
    'png'
  )
}
