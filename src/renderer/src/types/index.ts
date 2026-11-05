export type LayoutMode = 'edit-left' | 'edit-right' | 'edit-only' | 'preview-only'

export type ThemeMode = 'light' | 'dark' | 'system'

export type PreviewWidthMode = 'auto' | 'fixed'

/** PDF 导出在状态栏展示的生命周期：空闲 / 导出中 / 成功 / 失败 */
export type PdfExportStatus = 'idle' | 'exporting' | 'success' | 'error'

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
