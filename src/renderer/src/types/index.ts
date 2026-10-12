export type LayoutMode = 'edit-left' | 'edit-right' | 'edit-only' | 'preview-only'

export type ThemeMode = 'light' | 'dark' | 'system'

export type PreviewWidthMode = 'auto' | 'fixed'

export interface HeadingItem {
  id: string
  level: number
  text: string
  children: HeadingItem[]
}

export interface PreviewStyle {
  id: string
  name: string
  css: string
  isBuiltin: boolean
}

export interface PdfExportOptions {
  pageSize: 'A4' | 'Letter'
  margin: 'narrow' | 'standard' | 'wide'
  showPageNumbers: boolean
  showToc: boolean
  fileName: string
}
