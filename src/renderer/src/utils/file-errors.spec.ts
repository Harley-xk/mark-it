import { describe, expect, it } from 'vitest'
import { describeFileError, formatOpenFailureList, formatReadNotices } from './file-errors'
import type { FileReadResult } from '../../../shared/file-types'

function file(overrides: Partial<FileReadResult>): FileReadResult {
  return {
    path: 'D:/docs/demo.md',
    content: '# demo',
    encoding: 'utf-8',
    size: 1024,
    readOnly: false,
    excludedFromSession: false,
    notices: [],
    ...overrides
  }
}

describe('文件错误文案', () => {
  it('应为已知错误码给出稳定的中文说明', () => {
    expect(describeFileError({ code: 'not-found', message: 'ENOENT' }, 'zh-CN')).toContain('不存在')
    expect(describeFileError({ code: 'permission-denied', message: 'EACCES' }, 'zh-CN')).toContain(
      '权限'
    )
    expect(describeFileError({ code: 'too-large', message: 'big' }, 'zh-CN')).toContain('10 MiB')
    expect(describeFileError({ code: 'protected-path', message: 'protected' }, 'zh-CN')).toContain(
      '启动目录'
    )
  })

  it('应能切换为英文说明', () => {
    expect(describeFileError({ code: 'not-found', message: 'ENOENT' }, 'en-US')).toContain(
      'does not exist'
    )
  })

  it('未知错误应回退到主进程提供的原始信息', () => {
    expect(describeFileError({ code: 'io-error', message: 'device unavailable' }, 'zh-CN')).toBe(
      'device unavailable'
    )
    expect(describeFileError({ code: 'io-error', message: '' }, 'zh-CN')).toBe('未知的文件错误。')
  })
})

describe('打开失败列表', () => {
  it('应包含路径与原因，并折叠超出上限的条目', () => {
    const failures = Array.from({ length: 8 }, (_, index) => ({
      path: `D:/docs/${index}.md`,
      error: { code: 'not-found' as const, message: 'ENOENT' }
    }))
    const text = formatOpenFailureList(failures, 'zh-CN', 3)
    expect(text).toContain('D:/docs/0.md')
    expect(text).toContain('文件不存在')
    expect(text).not.toContain('D:/docs/3.md')
    expect(text).toContain('另有 5 个文件未能打开')
  })

  it('没有失败项时返回空字符串', () => {
    expect(formatOpenFailureList([], 'zh-CN')).toBe('')
  })
})

describe('只读提示', () => {
  it('应分别说明非 UTF-8 与超大文件的原因', () => {
    const text = formatReadNotices(
      [
        file({
          path: 'D:/docs/gbk.md',
          encoding: 'unsupported',
          readOnly: true,
          notices: ['non-utf8']
        }),
        file({
          path: 'D:/docs/big.md',
          size: 6 * 1024 * 1024,
          readOnly: true,
          notices: ['large-file']
        })
      ],
      'zh-CN'
    )
    expect(text).toContain('非 UTF-8')
    expect(text).toContain('另存为')
    expect(text).toContain('超过 5 MiB')
    expect(text).toContain('不会把正文写入会话')
  })

  it('UTF-16 提示应显示实际编码', () => {
    const text = formatReadNotices(
      [
        file({
          path: 'D:/docs/u16.md',
          encoding: 'utf-16le',
          readOnly: true,
          notices: ['non-utf8']
        })
      ],
      'zh-CN'
    )
    expect(text).toContain('UTF-16LE')
  })

  it('没有提示时返回空字符串', () => {
    expect(formatReadNotices([file({})], 'zh-CN')).toBe('')
  })
})
