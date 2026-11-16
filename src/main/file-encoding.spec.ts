import { describe, expect, it } from 'vitest'
import { decodeFileBuffer } from './file-encoding'

describe('文件编码探测', () => {
  it('空文件按可写 UTF-8 处理', () => {
    expect(decodeFileBuffer(Buffer.alloc(0))).toEqual({
      text: '',
      encoding: 'utf-8',
      writable: true
    })
  })

  it('普通 UTF-8 文本可写，并保留内容', () => {
    const result = decodeFileBuffer(Buffer.from('# 标题\n正文', 'utf-8'))
    expect(result.encoding).toBe('utf-8')
    expect(result.writable).toBe(true)
    expect(result.text).toBe('# 标题\n正文')
  })

  it('UTF-8 BOM 应识别为 utf-8-bom 并剥离 BOM，由 encoding 标记保留写回信息', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('abc', 'utf-8')])
    const result = decodeFileBuffer(buffer)
    expect(result.encoding).toBe('utf-8-bom')
    expect(result.writable).toBe(true)
    expect(result.text).toBe('abc')
  })

  it('UTF-16 LE BOM 应解码为文本但不可写', () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文', 'utf16le')])
    const result = decodeFileBuffer(buffer)
    expect(result.encoding).toBe('utf-16le')
    expect(result.writable).toBe(false)
    expect(result.text).toBe('中文')
  })

  it('UTF-16 BE BOM 应解码为文本但不可写', () => {
    const buffer = Buffer.from([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69])
    const result = decodeFileBuffer(buffer)
    expect(result.encoding).toBe('utf-16be')
    expect(result.writable).toBe(false)
    expect(result.text).toBe('hi')
  })

  it('非法 UTF-8 字节应标记为 unsupported，避免静默写回', () => {
    // GBK 编码的「中文」，不是合法 UTF-8
    const result = decodeFileBuffer(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]))
    expect(result.encoding).toBe('unsupported')
    expect(result.writable).toBe(false)
    expect(result.text).toContain('�')
  })

  it('含 NUL 字节的内容按二进制处理', () => {
    const result = decodeFileBuffer(Buffer.from([0x41, 0x00, 0x42]))
    expect(result.encoding).toBe('unsupported')
    expect(result.writable).toBe(false)
  })

  it('UTF-32 LE BOM 不作为 UTF-16 误判', () => {
    const result = decodeFileBuffer(Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00]))
    expect(result.encoding).toBe('unsupported')
    expect(result.writable).toBe(false)
  })
})
