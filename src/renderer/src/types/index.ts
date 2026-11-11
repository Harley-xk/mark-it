export type { LayoutMode } from '../../../shared/session-types'

export type ThemeMode = 'light' | 'dark' | 'system'

export type PreviewWidthMode = 'auto' | 'fixed'

/** 文档导出在状态栏展示的生命周期：空闲 / 导出中 / 成功 / 失败 */
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'
export type { ExportKind, ExportProgress } from '../../../shared/export-types'

export interface HeadingItem {
  id: string
  level: number
  text: string
  line: number
  children: HeadingItem[]
}

export interface PreviewStyle {
  id: string
  name: string
  css: string
  isBuiltin: boolean
}

export type { PdfExportOptions, PdfPageSize, PdfMargin } from '../../../shared/pdf-types'
export type {
  ImageContentWidth,
  ImageExportFormat,
  ImageExportOptions,
  ImageExportResult,
  ImageExportSettings,
  ImageExportTheme
} from '../../../shared/image-types'
