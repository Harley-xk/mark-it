/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 按字节判断文件文本编码，识别 UTF-8 / UTF-16 / 非法字节与二进制
 */
import type { FileTextEncoding } from '../shared/file-types'

export interface DecodedFileBuffer {
  /** 解码后的文本；非法字节按替换字符展示 */
  text: string
  encoding: FileTextEncoding
  /** 是否可以直接按原编码写回（仅 UTF-8 / UTF-8 BOM） */
  writable: boolean
}

/** 在前 8 KiB 内出现 NUL 字节时按二进制处理，避免把 UTF-16 无 BOM 文件当作文本 */
const BINARY_PROBE_BYTES = 8 * 1024

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

function containsNullByte(buffer: Buffer): boolean {
  const end = Math.min(buffer.length, BINARY_PROBE_BYTES)
  for (let index = 0; index < end; index += 1) {
    if (buffer[index] === 0) return true
  }
  return false
}

function decodeUtf8(buffer: Buffer): DecodedFileBuffer | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return {
      text,
      encoding: startsWith(buffer, [0xef, 0xbb, 0xbf]) ? 'utf-8-bom' : 'utf-8',
      writable: true
    }
  } catch {
    return null
  }
}

function decodeUtf16(buffer: Buffer, encoding: 'utf-16le' | 'utf-16be'): DecodedFileBuffer {
  return {
    // TextDecoder 会识别并剥离 BOM，UTF-16 文件仍能正常阅读
    text: new TextDecoder(encoding).decode(buffer),
    encoding,
    writable: false
  }
}

/**
 * 判定文件编码并解码。
 * 只有合法 UTF-8 被视为可写；UTF-16 与非法字节返回只读结果，避免保存时破坏原文件。
 */
export function decodeFileBuffer(buffer: Buffer): DecodedFileBuffer {
  if (buffer.length === 0) {
    return { text: '', encoding: 'utf-8', writable: true }
  }

  if (startsWith(buffer, [0xff, 0xfe])) {
    // FF FE 00 00 是 UTF-32 LE BOM；本项目不支持 UTF-32，按非法编码兜底
    if (startsWith(buffer, [0xff, 0xfe, 0x00, 0x00])) {
      return {
        text: new TextDecoder('utf-8').decode(buffer),
        encoding: 'unsupported',
        writable: false
      }
    }
    return decodeUtf16(buffer, 'utf-16le')
  }
  if (startsWith(buffer, [0xfe, 0xff])) {
    return decodeUtf16(buffer, 'utf-16be')
  }

  const utf8 = decodeUtf8(buffer)
  if (utf8 && !containsNullByte(buffer)) return utf8

  return {
    text: new TextDecoder('utf-8').decode(buffer),
    encoding: 'unsupported',
    writable: false
  }
}
