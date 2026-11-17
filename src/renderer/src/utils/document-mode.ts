/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 按文档字节数选择能力模式（normal / large / plain）的纯函数与阈值
 */

/** 文档能力模式：normal 全能力、large 预览默认关闭、plain 纯文本编辑 */
export type DocumentMode = 'normal' | 'large' | 'plain'

/**
 * 超过该字节数默认关闭预览。
 * 暂定初值，必须按 docs/编辑与预览/大文件能力降级方案.md 第 9 节实测校准。
 */
export const PREVIEW_DEGRADE_BYTES = 1024 * 1024

/**
 * 超过该字节数进入纯文本模式（编辑中跨过阈值需用户确认）。
 * 暂定初值，必须按 docs/编辑与预览/大文件能力降级方案.md 第 9 节实测校准。
 */
export const PLAIN_TEXT_BYTES = 5 * 1024 * 1024

export interface DocumentModeInput {
  /** 文件字节数；未保存文档取 UTF-8 编码后的字节数 */
  bytes: number
  /** 可选的复杂度信号，首版不启用 */
  mermaidCount?: number
}

/**
 * 按 UTF-8 编码规则计算字符串字节数。
 * 与 Buffer.byteLength(text, 'utf-8') 等价，但不需要分配 Buffer，
 * 便于在每次正文变化时低成本判断是否跨过阈值。
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

/** 仅按字节数判定模式；首版不引入复杂度加权 */
export function selectDocumentMode(input: DocumentModeInput): DocumentMode {
  if (input.bytes > PLAIN_TEXT_BYTES) return 'plain'
  if (input.bytes > PREVIEW_DEGRADE_BYTES) return 'large'
  return 'normal'
}

/** 与字节数相关的可降级状态；DocumentTab 满足该结构，可直接传入 */
export interface DocumentModeState {
  mode: DocumentMode
  /** 用户显式要求渲染预览（仅 large 模式有意义） */
  previewOverride: boolean
  /** 预览是否因内容增长被自动暂停 */
  previewAutoPaused: boolean
  /** 是否等待用户确认切换纯文本模式 */
  plainSuggested: boolean
  /** 用户已拒绝切换；缩小到阈值以下前不再提示 */
  plainPromptDismissed: boolean
}

/**
 * 按新字节数推进能力模式状态。
 * - 编辑中跨过预览阈值：自动切到 large 并暂停预览
 * - 跨过纯文本阈值：只标记 plainSuggested，等用户确认后切换
 * - 内容缩小回预览阈值内：保留 large / plain，不自动恢复预览
 */
export function applyDocumentSize(state: DocumentModeState, size: number): void {
  if (!Number.isFinite(size) || size < 0) return

  if (size <= PREVIEW_DEGRADE_BYTES) {
    state.previewAutoPaused = false
    state.plainSuggested = false
    state.plainPromptDismissed = false
    // 纯文本模式是用户确认后的选择；内容缩小时由用户手动恢复 Markdown 模式
    return
  }

  if (state.mode === 'normal') {
    state.mode = 'large'
    state.previewOverride = false
    state.previewAutoPaused = true
  }

  if (state.mode === 'plain') return

  const overPlain = size > PLAIN_TEXT_BYTES
  if (!overPlain) state.plainPromptDismissed = false
  state.plainSuggested = overPlain && !state.plainPromptDismissed
}
