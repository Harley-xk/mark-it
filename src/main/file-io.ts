/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 受信任路径下的文本文件读写，统一编码探测、大小阈值与结构化错误
 */
import { readFile, stat, writeFile } from 'fs/promises'
import type {
  FileIoError,
  FileIoErrorCode,
  FileOpenNotice,
  FileReadResponse,
  FileSaveResponse
} from '../shared/file-types'
import { decodeFileBuffer } from './file-encoding'
import { findProtectedRoot, isTrustedPath } from './path-guard'

/** 超过该大小只读打开，且不把正文写入会话快照 */
export const FILE_SIZE_WARN_BYTES = 5 * 1024 * 1024
/** 超过该大小直接拒绝打开 */
export const FILE_SIZE_MAX_BYTES = 10 * 1024 * 1024

export interface FileIoPolicy {
  platform: NodeJS.Platform
  /** 已归一化的信任路径集合 */
  trustedPaths: ReadonlySet<string>
  /** 已归一化的受保护目录 */
  protectedRoots: readonly string[]
  warnBytes?: number
  maxBytes?: number
}

function createError(code: FileIoErrorCode, message: string): FileIoError {
  return { code, message }
}

/** 把 Node 文件系统错误映射为可跨进程传递的错误码 */
export function mapFileError(error: unknown): FileIoError {
  const nodeError = error as NodeJS.ErrnoException | undefined
  const message = error instanceof Error ? error.message : String(error)
  switch (nodeError?.code) {
    case 'ENOENT':
      return createError('not-found', message)
    case 'EACCES':
    case 'EPERM':
      return createError('permission-denied', message)
    case 'EISDIR':
      return createError('is-directory', message)
    case 'ENOSPC':
      return createError('disk-full', message)
    case 'EROFS':
      return createError('read-only-filesystem', message)
    case 'ENAMETOOLONG':
    case 'EINVAL':
      return createError('invalid-path', message)
    default:
      return createError('io-error', message)
  }
}

function checkTrusted(filePath: string, policy: FileIoPolicy): FileIoError | null {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return createError('invalid-path', 'Missing file path')
  }
  if (!isTrustedPath(policy.trustedPaths, filePath, policy.platform)) {
    return createError('not-trusted', 'Path was not opened through a user-initiated entry')
  }
  return null
}

function checkProtected(filePath: string, policy: FileIoPolicy): FileIoError | null {
  const root = findProtectedRoot(filePath, policy.protectedRoots, policy.platform)
  return root
    ? createError('protected-path', `Refusing to write inside protected directory: ${root}`)
    : null
}

/** 读取文本文件；非 UTF-8 与超大文件返回只读结果而不是失败 */
export async function readTextFile(
  filePath: string,
  policy: FileIoPolicy
): Promise<FileReadResponse> {
  const trustError = checkTrusted(filePath, policy)
  if (trustError) return { ok: false, path: filePath, error: trustError }

  const warnBytes = policy.warnBytes ?? FILE_SIZE_WARN_BYTES
  const maxBytes = policy.maxBytes ?? FILE_SIZE_MAX_BYTES

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) {
      return {
        ok: false,
        path: filePath,
        error: createError('is-directory', 'Path is a directory')
      }
    }
    if (info.size > maxBytes) {
      return {
        ok: false,
        path: filePath,
        error: createError(
          'too-large',
          `File is too large (${info.size} bytes, limit ${maxBytes} bytes)`
        )
      }
    }

    const buffer = await readFile(filePath)
    // 读取期间文件可能继续增长：以实际读到的字节数为准再校验一次
    const size = Math.max(info.size, buffer.length)
    if (size > maxBytes) {
      return {
        ok: false,
        path: filePath,
        error: createError(
          'too-large',
          `File is too large (${size} bytes, limit ${maxBytes} bytes)`
        )
      }
    }

    const decoded = decodeFileBuffer(buffer)
    const notices: FileOpenNotice[] = []
    if (!decoded.writable) notices.push('non-utf8')
    if (size > warnBytes) notices.push('large-file')

    return {
      ok: true,
      file: {
        path: filePath,
        content: decoded.text,
        encoding: decoded.encoding,
        size,
        readOnly: notices.length > 0,
        excludedFromSession: size > warnBytes,
        notices
      }
    }
  } catch (error) {
    return { ok: false, path: filePath, error: mapFileError(error) }
  }
}

/** 写入 UTF-8 文本；路径必须在信任集合内且不在受保护目录中 */
export async function writeTextFile(
  filePath: string,
  content: string,
  policy: FileIoPolicy
): Promise<FileSaveResponse> {
  const trustError = checkTrusted(filePath, policy)
  if (trustError) return { ok: false, path: filePath, error: trustError }
  const protectedError = checkProtected(filePath, policy)
  if (protectedError) return { ok: false, path: filePath, error: protectedError }

  try {
    await writeFile(filePath, content, 'utf-8')
    const size = Buffer.byteLength(content, 'utf-8')
    return {
      ok: true,
      path: filePath,
      size,
      excludedFromSession: size > (policy.warnBytes ?? FILE_SIZE_WARN_BYTES)
    }
  } catch (error) {
    return { ok: false, path: filePath, error: mapFileError(error) }
  }
}
