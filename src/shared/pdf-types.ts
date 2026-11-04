/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 跨进程共享的 PDF 导出选项类型，供渲染进程、preload 与主进程复用
 */

export type PdfPageSize = 'A4' | 'Letter'

export type PdfMargin = 'narrow' | 'standard' | 'wide'

export interface PdfExportOptions {
  pageSize: PdfPageSize
  margin: PdfMargin
  /** 是否在页脚输出「当前页 / 总页数」 */
  showPageNumbers: boolean
  /** 是否在正文前生成标题目录 */
  showToc: boolean
  /** 保存对话框的默认文件名（由渲染进程按当前文档名生成） */
  fileName: string
}
