/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 文件打开 / 保存失败与只读提示的统一对话框入口
 */
import type { FileOpenFailure, FileReadResult } from '../../../shared/file-types'
import { formatOpenFailureList, formatReadNotices } from '../utils/file-errors'
import { confirmUnsaved } from './useConfirmUnsaved'

/** 提示信息对话框：只有一个「知道了」按钮 */
async function showInfo(title: string, message: string): Promise<void> {
  if (!message) return
  await confirmUnsaved(title, message, { save: '知道了' }, true, { hideDiscard: true })
}

export async function showFileOpenFailures(failures: FileOpenFailure[]): Promise<void> {
  await showInfo('部分文件未能打开', formatOpenFailureList(failures))
}

export async function showFileReadNotices(files: FileReadResult[]): Promise<void> {
  await showInfo('文件打开提示', formatReadNotices(files))
}

export async function showFileFailureMessage(title: string, message: string): Promise<void> {
  await showInfo(title, message)
}
