/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 预览窗口载荷校验与长度上限
 */
import type {
  DiagramPreviewMedia,
  ImagePreviewMedia,
  PreviewMedia,
  PreviewTheme,
  PreviewWindowPayload
} from '../shared/preview-types'

/** SVG 文本与图片地址的最大长度，避免超大 IPC 载荷进入预览窗口 */
export const PREVIEW_SVG_MAX_LENGTH = 16 * 1024 * 1024
export const PREVIEW_SRC_MAX_LENGTH = 16 * 1024 * 1024
const TITLE_MAX_LENGTH = 512
const MAX_MEDIA_DIMENSION = 100_000

function asString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

function asBackground(value: unknown): string {
  return asString(value, TITLE_MAX_LENGTH) ?? '#ffffff'
}

function asDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(MAX_MEDIA_DIMENSION, Math.round(value))
}

function asTheme(value: unknown): PreviewTheme | null {
  return value === 'light' || value === 'dark' ? value : null
}

function parseDiagram(raw: Record<string, unknown>): DiagramPreviewMedia | null {
  const svgXml = asString(raw.svgXml, PREVIEW_SVG_MAX_LENGTH)
  if (!svgXml) return null
  return {
    kind: 'diagram',
    svgXml,
    width: asDimension(raw.width, 800),
    height: asDimension(raw.height, 600),
    background: asBackground(raw.background)
  }
}

function parseImage(raw: Record<string, unknown>): ImagePreviewMedia | null {
  const src = asString(raw.src, PREVIEW_SRC_MAX_LENGTH)
  if (!src) return null
  return {
    kind: 'image',
    src,
    width: asDimension(raw.width, 800),
    height: asDimension(raw.height, 600),
    background: asBackground(raw.background),
    fileName: asString(raw.fileName, TITLE_MAX_LENGTH) ?? 'image.png',
    localPath: typeof raw.localPath === 'string' && raw.localPath ? raw.localPath : null,
    remote: raw.remote === true
  }
}

function parseMedia(raw: unknown): PreviewMedia | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.kind === 'diagram') return parseDiagram(record)
  if (record.kind === 'image') return parseImage(record)
  return null
}

/** 校验来自渲染进程的预览载荷；不合法时返回 null */
export function parsePreviewPayload(raw: unknown): PreviewWindowPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const theme = asTheme(record.theme)
  const media = parseMedia(record.media)
  if (!theme || !media) return null
  return { theme, media }
}
