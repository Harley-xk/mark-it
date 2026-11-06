import { describe, it, expect } from 'vitest'
import {
  channelFileName,
  channelOfVersion,
  compareVersions,
  isPrerelease,
  parseChannelVersion,
  parseVersion,
  selectUpdateCandidate
} from './update-channel'

describe('channelFileName', () => {
  it('应按平台返回 electron-updater 使用的元数据文件名', () => {
    expect(channelFileName('win32')).toBe('latest.yml')
    expect(channelFileName('darwin')).toBe('latest-mac.yml')
    expect(channelFileName('linux')).toBe('latest-linux.yml')
  })
})

describe('parseChannelVersion', () => {
  it('应读取 latest.yml 顶层的 version', () => {
    expect(parseChannelVersion('version: 1.5.0\npath: mark-it-1.5.0-setup.exe\n')).toBe('1.5.0')
  })

  it('应支持带引号的预发布版本', () => {
    expect(parseChannelVersion("version: '1.6.0-beta.1'\n")).toBe('1.6.0-beta.1')
  })

  it('应兼容 CRLF 换行', () => {
    expect(parseChannelVersion('version: 1.6.0-beta.2\r\npath: app.exe\r\n')).toBe('1.6.0-beta.2')
  })

  it('不应把 releaseNotes 里的 version 误判为顶层字段', () => {
    const text = ['version: 1.5.0', 'releaseNotes: |-', '  version: 9.9.9', '  - 修复问题'].join(
      '\n'
    )
    expect(parseChannelVersion(text)).toBe('1.5.0')
  })

  it('缺少或非法 version 时应返回 null', () => {
    expect(parseChannelVersion('path: app.exe\n')).toBeNull()
    expect(parseChannelVersion('version: not-a-version\n')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('应按主次修订号比较', () => {
    expect(compareVersions('1.5.0', '1.5.0')).toBe(0)
    expect(compareVersions('1.5.1', '1.5.0')).toBe(1)
    expect(compareVersions('1.4.9', '1.5.0')).toBe(-1)
  })

  it('预发布版本应小于同一 base 的正式版', () => {
    expect(compareVersions('1.6.0-beta.3', '1.6.0')).toBe(-1)
    expect(compareVersions('1.6.0', '1.6.0-beta.3')).toBe(1)
  })

  it('预发布版本应大于上一个正式版', () => {
    expect(compareVersions('1.6.0-beta.1', '1.5.0')).toBe(1)
    expect(compareVersions('1.5.1-beta.1', '1.5.0')).toBe(1)
  })

  it('预发布数字标识符应按数值比较', () => {
    expect(compareVersions('1.6.0-beta.2', '1.6.0-beta.10')).toBe(-1)
    expect(compareVersions('1.6.0-beta.10', '1.6.0-beta.2')).toBe(1)
  })

  it('标识符更少的预发布版本更小', () => {
    expect(compareVersions('1.6.0-beta.1', '1.6.0-beta.1.1')).toBe(-1)
  })

  it('数字标识符应小于非数字标识符', () => {
    expect(compareVersions('1.6.0-beta.1', '1.6.0-beta.rc')).toBe(-1)
  })

  it('非法版本应视为最小', () => {
    expect(compareVersions('invalid', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', 'invalid')).toBe(1)
    expect(compareVersions('invalid', 'invalid')).toBe(0)
  })
})

describe('通道判定', () => {
  it('应把预期发布后缀识别为 beta', () => {
    expect(isPrerelease('1.6.0-beta.1')).toBe(true)
    expect(isPrerelease('1.6.0')).toBe(false)
    expect(channelOfVersion('1.6.0-beta.1')).toBe('beta')
    expect(channelOfVersion('1.6.0')).toBe('stable')
  })

  it('parseVersion 应返回主次修订号与预发布标识', () => {
    expect(parseVersion('1.6.0-beta.2')).toEqual({
      major: 1,
      minor: 6,
      patch: 0,
      prerelease: ['beta', '2']
    })
    expect(parseVersion('1.6')).toBeNull()
  })
})

describe('selectUpdateCandidate', () => {
  it('应在正式版更新时选择 stable', () => {
    expect(
      selectUpdateCandidate(
        [
          { channel: 'stable', version: '1.6.0' },
          { channel: 'beta', version: '1.6.0-beta.3' }
        ],
        '1.5.0-beta.2'
      )
    ).toEqual({ channel: 'stable', version: '1.6.0' })
  })

  it('应在 beta 更新时选择 beta', () => {
    expect(
      selectUpdateCandidate(
        [
          { channel: 'stable', version: '1.5.0' },
          { channel: 'beta', version: '1.6.0-beta.1' }
        ],
        '1.5.0'
      )
    ).toEqual({ channel: 'beta', version: '1.6.0-beta.1' })
  })

  it('所有候选都不高于当前版本时应返回 null', () => {
    expect(
      selectUpdateCandidate(
        [
          { channel: 'stable', version: '1.5.0' },
          { channel: 'beta', version: '1.6.0-beta.1' }
        ],
        '1.6.0-beta.2'
      )
    ).toBeNull()
  })

  it('同版本时应优先 stable', () => {
    expect(
      selectUpdateCandidate(
        [
          { channel: 'beta', version: '1.6.0' },
          { channel: 'stable', version: '1.6.0' }
        ],
        '1.5.0'
      )
    ).toEqual({ channel: 'stable', version: '1.6.0' })
  })

  it('没有候选时应返回 null', () => {
    expect(selectUpdateCandidate([], '1.0.0')).toBeNull()
  })
})
