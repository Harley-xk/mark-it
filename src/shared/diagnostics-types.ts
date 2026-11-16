/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 渲染进程错误上报与诊断日志的共享纯类型
 */

export type RendererErrorKind = 'error' | 'unhandledrejection'

export interface RendererErrorReport {
  kind: RendererErrorKind
  message: string
  /** 出错脚本或页面地址 */
  source?: string
  stack?: string
}
