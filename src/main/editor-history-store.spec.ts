import { describe, expect, it } from 'vitest'
import { capHistoryEntries, parseEditorHistoryFile } from './editor-history-store'

describe('编辑历史侧车校验', () => {
  it('应保留合法标签历史并丢弃非对象条目', () => {
    expect(
      capHistoryEntries({
        a: { doc: 'alpha' },
        b: 'invalid',
        c: null
      })
    ).toEqual({ a: { doc: 'alpha' } })
  })

  it('应同时限制单条与整窗历史大小', () => {
    expect(capHistoryEntries({ a: { value: '123456' }, b: { value: 'abcdef' } }, 20, 21)).toEqual({
      a: { value: '123456' }
    })
  })

  it('应解析 v1 文件并忽略损坏窗口', () => {
    const data = parseEditorHistoryFile({
      version: 1,
      windows: {
        'window-a': { tabA: { doc: 'A' } },
        broken: 'invalid'
      }
    })
    expect(data?.windows['window-a']).toEqual({ tabA: { doc: 'A' } })
    expect(data?.windows.broken).toEqual({})
  })

  it('版本不符或结构损坏时应返回 null', () => {
    expect(parseEditorHistoryFile({ version: 2, windows: {} })).toBeNull()
    expect(parseEditorHistoryFile(null)).toBeNull()
  })
})
