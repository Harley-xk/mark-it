import { describe, expect, it } from 'vitest'
import {
  PLAIN_TEXT_BYTES,
  PREVIEW_DEGRADE_BYTES,
  applyDocumentSize,
  selectDocumentMode,
  utf8ByteLength,
  type DocumentModeInput,
  type DocumentModeState
} from './document-mode'

function mode(bytes: number): DocumentModeInput {
  return { bytes }
}

function state(overrides: Partial<DocumentModeState> = {}): DocumentModeState {
  return {
    mode: 'normal',
    previewOverride: false,
    previewAutoPaused: false,
    plainSuggested: false,
    plainPromptDismissed: false,
    ...overrides
  }
}

describe('文档能力模式判定', () => {
  it('阈值边界应按「超过才降级」处理', () => {
    expect(selectDocumentMode(mode(0))).toBe('normal')
    expect(selectDocumentMode(mode(PREVIEW_DEGRADE_BYTES))).toBe('normal')
    expect(selectDocumentMode(mode(PREVIEW_DEGRADE_BYTES + 1))).toBe('large')
    expect(selectDocumentMode(mode(PLAIN_TEXT_BYTES))).toBe('large')
    expect(selectDocumentMode(mode(PLAIN_TEXT_BYTES + 1))).toBe('plain')
  })

  it('复杂度信号首版不参与判定', () => {
    expect(selectDocumentMode({ bytes: 1024, mermaidCount: 10000 })).toBe('normal')
  })

  it('非法字节数不应误判为大文件', () => {
    expect(selectDocumentMode(mode(Number.NaN))).toBe('normal')
    expect(selectDocumentMode(mode(-1))).toBe('normal')
  })
})

describe('内容增长时的模式迁移', () => {
  it('normal 跨过预览阈值应自动降级并暂停预览', () => {
    const current = state()
    applyDocumentSize(current, PREVIEW_DEGRADE_BYTES + 1)
    expect(current.mode).toBe('large')
    expect(current.previewAutoPaused).toBe(true)
    expect(current.plainSuggested).toBe(false)
  })

  it('normal 直接跨过纯文本阈值应降级并提示切换', () => {
    const current = state()
    applyDocumentSize(current, PLAIN_TEXT_BYTES + 1)
    expect(current.mode).toBe('large')
    expect(current.previewAutoPaused).toBe(true)
    expect(current.plainSuggested).toBe(true)
  })

  it('用户拒绝切换后不应重复提示', () => {
    const current = state({ mode: 'large', plainPromptDismissed: true })
    applyDocumentSize(current, PLAIN_TEXT_BYTES + 1)
    expect(current.plainSuggested).toBe(false)
  })

  it('已进入纯文本模式时不再回退或提示', () => {
    const current = state({
      mode: 'plain',
      plainSuggested: false,
      previewAutoPaused: false,
      previewOverride: true
    })
    applyDocumentSize(current, PLAIN_TEXT_BYTES + 1024)
    expect(current.mode).toBe('plain')
    expect(current.plainSuggested).toBe(false)
    expect(current.previewOverride).toBe(true)
  })

  it('内容缩小回预览阈值内应清除暂停与提示状态，但不自动恢复预览', () => {
    const current = state({ mode: 'large', previewAutoPaused: true, plainSuggested: true })
    applyDocumentSize(current, PREVIEW_DEGRADE_BYTES)
    expect(current.mode).toBe('large')
    expect(current.previewAutoPaused).toBe(false)
    expect(current.plainSuggested).toBe(false)
    expect(current.plainPromptDismissed).toBe(false)
  })

  it('非法字节数不应改变状态', () => {
    const current = state({ mode: 'large' })
    applyDocumentSize(current, Number.NaN)
    applyDocumentSize(current, -1)
    expect(current.mode).toBe('large')
    expect(current.previewAutoPaused).toBe(false)
  })
})

describe('UTF-8 字节数', () => {
  it('应覆盖 ASCII、中文、emoji 与 lone surrogate', () => {
    const samples = ['', 'hello', '中文', '😀', 'a中😀', '\ud800', 'x\ud800y', '混合 text 123']
    for (const sample of samples) {
      expect(utf8ByteLength(sample)).toBe(Buffer.byteLength(sample, 'utf-8'))
    }
  })

  it('应与真实文件大小一致', () => {
    const text = '标题\n\n段落内容 with English.\n'
    expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, 'utf-8'))
  })
})
