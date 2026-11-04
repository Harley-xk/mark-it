/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 跨进程共享的文件读写结果类型
 */

/** 主进程读取文件后的返回结果（纯类型，无运行时依赖） */
export interface FileReadResult {
  path: string
  content: string
}
