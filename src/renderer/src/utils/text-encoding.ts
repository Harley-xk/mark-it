/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 文本换行符与 BOM 的检测、归一化与还原，保证保存时保持原文件行尾
 */

export type LineEnding = '\n' | '\r\n'

export interface DecodedText {
  /** 去掉 BOM、统一为 LF 后的内容 */
  text: string
  /** 原文本使用的换行符；没有换行时按 LF 处理 */
  eol: LineEnding
  /** 原文本是否带 UTF-8 BOM */
  bom: boolean
}

/** 把所有换行符统一为 LF（编辑器内部约定） */
export function normalizeToLf(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** 拆分 BOM、换行符与正文；正文统一为 LF */
export function decodeText(raw: string): DecodedText {
  const bom = raw.charCodeAt(0) === 0xfeff
  const body = bom ? raw.slice(1) : raw
  return {
    text: normalizeToLf(body),
    eol: body.includes('\r\n') ? '\r\n' : '\n',
    bom
  }
}

/** 按文档记录的换行符与 BOM 还原为写盘内容 */
export function encodeText(text: string, eol: LineEnding, bom: boolean): string {
  const normalized = normalizeToLf(text)
  const withEol = eol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized
  return (bom ? String.fromCharCode(0xfeff) : '') + withEol
}
