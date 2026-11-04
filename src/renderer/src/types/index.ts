export type LayoutMode = 'edit-left' | 'edit-right' | 'edit-only' | 'preview-only'

export type ThemeMode = 'light' | 'dark' | 'system'

export type PreviewWidthMode = 'auto' | 'fixed'

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
