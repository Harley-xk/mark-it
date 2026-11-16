/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 跨进程共享的文件读写结果类型
 */

/** 主进程识别出的文件文本编码；unsupported 表示不是合法 UTF-8 / UTF-16 */
export type FileTextEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'unsupported'

/** 文件读写失败原因，渲染进程据此生成用户文案 */
export type FileIoErrorCode =
  | 'not-found'
  | 'permission-denied'
  | 'is-directory'
  | 'too-large'
  | 'disk-full'
  | 'read-only-filesystem'
  | 'invalid-path'
  | 'not-trusted'
  | 'protected-path'
  | 'io-error'

export interface FileIoError {
  code: FileIoErrorCode
  /** 主进程原始错误信息，用于日志与兜底展示 */
  message: string
}

/** 打开文件时需要提示用户的原因 */
export type FileOpenNotice = 'non-utf8' | 'large-file'

/** 主进程读取文件后的返回结果（纯类型，无运行时依赖） */
export interface FileReadResult {
  path: string
  content: string
  /** 原始文件编码 */
  encoding: FileTextEncoding
  /** 文件字节数 */
  size: number
  /** 是否只读：非 UTF-8 或超过警告阈值 */
  readOnly: boolean
  /** 是否因超过警告阈值而不把正文写入会话快照 */
  excludedFromSession: boolean
  /** 需要在界面提示的原因 */
  notices: FileOpenNotice[]
}

export interface FileOpenFailure {
  path: string
  error: FileIoError
}

export type FileReadResponse =
  { ok: true; file: FileReadResult } | { ok: false; path: string; error: FileIoError }

export type FileSaveResponse =
  | { ok: true; path: string; size: number; excludedFromSession: boolean }
  | { ok: false; path: string; error: FileIoError }

export interface OpenFilesResponse {
  files: FileReadResult[]
  failures: FileOpenFailure[]
}
