/*
 * 作者: Harley-xk
 * 创建: 2026-11-05
 *
 * 描述: 根据当前文档名派生 PDF 导出的默认文件名
 */

/**
 * 把文档名转换为 PDF 默认文件名：
 * 去掉 Markdown / 文本扩展名后追加 `.pdf`，结果永远非空（兜底 `untitled.pdf`），
 * 避免系统保存对话框的文件名输入框留空。
 */
export function derivePdfFileName(name: string | null | undefined): string {
  const base = (name ?? '')
    .trim()
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .trim()
  return `${base || 'untitled'}.pdf`
}
