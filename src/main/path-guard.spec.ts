import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  findProtectedRoot,
  isBlockedOpenPath,
  isTrustedPath,
  isWithinRoot,
  normalizeGuardPath,
  registerTrustedPath,
  startupDirectories
} from './path-guard'

describe('路径归一化', () => {
  it('Windows 下忽略大小写、反斜杠与末尾斜杠', () => {
    expect(normalizeGuardPath('D:\\Docs\\A.MD\\', 'win32')).toBe('d:/docs/a.md')
    expect(normalizeGuardPath('d:/docs/a.md', 'win32')).toBe('d:/docs/a.md')
  })

  it('POSIX 下保留大小写', () => {
    expect(normalizeGuardPath('/home/User/A.md', 'linux')).toBe('/home/User/A.md')
    expect(normalizeGuardPath('/home/User/A.md/', 'linux')).toBe('/home/User/A.md')
  })

  it('盘符根目录保留结尾斜杠', () => {
    expect(normalizeGuardPath('C:\\', 'win32')).toBe('c:/')
    expect(normalizeGuardPath('C:', 'win32')).toBe('c:/')
  })
})

describe('系统默认程序打开的黑名单', () => {
  it('可执行文件与脚本应被拒绝，忽略大小写', () => {
    expect(isBlockedOpenPath('D:/docs/setup.exe')).toBe(true)
    expect(isBlockedOpenPath('D:/docs/run.BAT')).toBe(true)
    expect(isBlockedOpenPath('/home/a/start.sh')).toBe(true)
    expect(isBlockedOpenPath('D:/docs/note.lnk')).toBe(true)
  })

  it('普通文档、图片与 PDF 不应被拦截', () => {
    expect(isBlockedOpenPath('D:/docs/report.pdf')).toBe(false)
    expect(isBlockedOpenPath('D:/docs/pic.png')).toBe(false)
    expect(isBlockedOpenPath('D:/docs/notes.txt')).toBe(false)
    expect(isBlockedOpenPath('D:/docs/exe')).toBe(false)
  })
})

describe('受保护目录判定', () => {
  it('只把目录本身与其子路径视为命中，不误伤同前缀目录', () => {
    expect(isWithinRoot('/app/docs/a.md', '/app', 'linux')).toBe(true)
    expect(isWithinRoot('/app', '/app', 'linux')).toBe(true)
    expect(isWithinRoot('/application/a.md', '/app', 'linux')).toBe(false)
  })

  it('Windows 盘符根目录可以匹配其下所有路径', () => {
    expect(isWithinRoot('C:\\Users\\a.md', 'C:\\', 'win32')).toBe(true)
  })

  it('返回首个命中的受保护目录', () => {
    expect(findProtectedRoot('/app/config/a.md', ['/other', '/app/config'], 'linux')).toBe(
      '/app/config'
    )
    expect(findProtectedRoot('/safe/a.md', ['/other'], 'linux')).toBeNull()
  })
})

describe('信任集合', () => {
  it('登记后按同一归一化规则可命中', () => {
    const trusted = new Set<string>()
    registerTrustedPath(trusted, 'D:\\Docs\\A.md', 'win32')
    expect(isTrustedPath(trusted, 'd:/docs/a.md', 'win32')).toBe(true)
    expect(isTrustedPath(trusted, 'd:/docs/b.md', 'win32')).toBe(false)
  })

  it('空路径不登记', () => {
    const trusted = new Set<string>()
    registerTrustedPath(trusted, '', 'win32')
    registerTrustedPath(trusted, null, 'win32')
    expect(trusted.size).toBe(0)
  })
})

describe('开机启动目录', () => {
  it('Windows 使用当前用户的 Startup 目录', () => {
    expect(startupDirectories('win32', 'C:/Users/u', 'C:/Users/u/AppData/Roaming')).toEqual([
      join('C:/Users/u/AppData/Roaming', 'Microsoft/Windows/Start Menu/Programs/Startup')
    ])
  })

  it('macOS 与 Linux 使用各自的 autostart 目录', () => {
    expect(
      startupDirectories('darwin', '/Users/u', '/Users/u/Library/Application Support')
    ).toEqual([join('/Users/u', 'Library/LaunchAgents')])
    expect(startupDirectories('linux', '/home/u', '/home/u/.config')).toEqual([
      join('/home/u', '.config/autostart')
    ])
  })
})
