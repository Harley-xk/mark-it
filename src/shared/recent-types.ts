/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 最近打开文件列表与打开结果的跨进程纯类型
 */
import type { FileIoError, FileReadResult } from './file-types'

/** 主进程返回给渲染进程的最近打开条目；文件缺失只影响展示，不构成读取信任 */
export interface RecentFileEntry {
  path: string
  name: string
  openedAt: number
  missing: boolean
}

/** 从最近列表打开文件的三种结果 */
export type RecentOpenResult =
  | { status: 'opened'; file: FileReadResult }
  | { status: 'focused' }
  | { status: 'failed'; path: string; error: FileIoError }
