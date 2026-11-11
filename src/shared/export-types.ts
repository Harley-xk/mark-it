/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: PDF 与图片导出共用的类型、任务标识和阶段进度载荷
 */

export type ExportKind = 'pdf' | 'image'

export interface ExportProgress {
  /** 渲染进程为单次导出生成的唯一标识，用于隔离旧任务与其它窗口 */
  requestId: string
  kind: ExportKind
  /** 已知阶段百分比，范围 0–100；不代表 Chromium 内部字节进度 */
  percent: number
  stage: string
}
