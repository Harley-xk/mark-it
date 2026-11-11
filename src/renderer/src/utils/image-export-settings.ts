/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 图片导出设置的默认值、合法范围与持久化数据归一化
 */

import type { ImageContentWidth, ImageExportSettings } from '../../../shared/image-types'

export const IMAGE_EXPORT_SETTINGS_KEY = 'markit-image-export-settings'

export const IMAGE_CONTENT_WIDTHS: ImageContentWidth[] = [640, 800, 1000, 1200]

export const DEFAULT_IMAGE_EXPORT_SETTINGS: ImageExportSettings = {
  format: 'png',
  contentWidth: 800,
  scale: 2,
  theme: 'preview',
  includeFrontmatter: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeImageExportSettings(value: unknown): ImageExportSettings {
  if (!isRecord(value)) return { ...DEFAULT_IMAGE_EXPORT_SETTINGS }

  const format =
    value.format === 'png' || value.format === 'jpeg'
      ? value.format
      : DEFAULT_IMAGE_EXPORT_SETTINGS.format
  const contentWidth =
    typeof value.contentWidth === 'number' &&
    IMAGE_CONTENT_WIDTHS.includes(value.contentWidth as ImageContentWidth)
      ? (value.contentWidth as ImageContentWidth)
      : DEFAULT_IMAGE_EXPORT_SETTINGS.contentWidth
  const scale =
    value.scale === 1 || value.scale === 2 ? value.scale : DEFAULT_IMAGE_EXPORT_SETTINGS.scale
  const theme =
    value.theme === 'preview' || value.theme === 'light' || value.theme === 'dark'
      ? value.theme
      : DEFAULT_IMAGE_EXPORT_SETTINGS.theme
  const includeFrontmatter =
    typeof value.includeFrontmatter === 'boolean'
      ? value.includeFrontmatter
      : DEFAULT_IMAGE_EXPORT_SETTINGS.includeFrontmatter

  return { format, contentWidth, scale, theme, includeFrontmatter }
}
