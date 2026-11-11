/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 跨进程共享的当前文档长图导出选项类型
 */

export interface ImageExportOptions {
  /** 请求的截图倍率；主进程会按页面尺寸预算自动降级 */
  scale: number
  /** 保存对话框的默认文件名（由渲染进程按当前文档名生成） */
  fileName: string
  /** 当前文档路径；有值时保存对话框默认定位到文档所在目录 */
  sourcePath: string | null
}
