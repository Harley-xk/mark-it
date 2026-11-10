import { describe, expect, it } from 'vitest'
import {
  buildVSCodeIntegrationConfig,
  compareVersions,
  detectVSCodeInstallations,
  getManagedExtensionVersion,
  getVSCodePathCandidates,
  isMacTranslocatedPath,
  isManagedExtensionName,
  normalizeIntegrationPath,
  type IntegrationRuntime
} from './vscode-integration'

interface FakeEntry {
  name: string
  isDirectory: boolean
}

interface FakeFileSystem {
  isFile: (targetPath: string) => Promise<boolean>
  isDirectory: (targetPath: string) => Promise<boolean>
  readDir: (targetPath: string) => Promise<FakeEntry[]>
  readPackageVersion: (extensionDir: string) => Promise<string | null>
  readInstalledAppVersion: (extensionDir: string) => Promise<string | null>
}

function runtime(overrides: Partial<IntegrationRuntime> = {}): IntegrationRuntime {
  return {
    platform: 'win32',
    env: {
      USERPROFILE: 'C:\\Users\\tester',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      ProgramFiles: 'C:\\Program Files',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      PATH: ''
    },
    userDataDir: 'C:\\Users\\tester\\AppData\\Roaming\\mark-it',
    appVersion: '1.5.0',
    isPackaged: true,
    execPath: 'C:\\Program Files\\MarkIt\\Mark It.exe',
    extensionSourcePaths: [],
    ...overrides
  }
}

function fakeFileSystem(options: {
  platform: IntegrationRuntime['platform']
  files?: string[]
  directories?: Record<string, FakeEntry[]>
  packageVersions?: Record<string, string>
  installedAppVersions?: Record<string, string>
}): FakeFileSystem {
  const normalize = (targetPath: string): string =>
    normalizeIntegrationPath(targetPath, options.platform)
  const files = new Set((options.files ?? []).map(normalize))
  const directories = new Map(
    Object.entries(options.directories ?? {}).map(([key, entries]) => [normalize(key), entries])
  )
  const packageVersions = new Map(
    Object.entries(options.packageVersions ?? {}).map(([key, value]) => [normalize(key), value])
  )
  const installedAppVersions = new Map(
    Object.entries(options.installedAppVersions ?? {}).map(([key, value]) => [
      normalize(key),
      value
    ])
  )
  return {
    isFile: async (targetPath: string) => files.has(normalize(targetPath)),
    isDirectory: async (targetPath: string) => directories.has(normalize(targetPath)),
    readDir: async (targetPath: string) => directories.get(normalize(targetPath)) ?? [],
    readPackageVersion: async (extensionDir: string) =>
      packageVersions.get(normalize(extensionDir)) ?? null,
    readInstalledAppVersion: async (extensionDir: string) =>
      installedAppVersions.get(normalize(extensionDir)) ?? null
  }
}

describe('VSCode 路径候选', () => {
  it('Windows 同时生成 Stable 与 Insiders 的 PATH、安装目录和扩展目录候选', () => {
    const candidates = getVSCodePathCandidates('win32', runtime().env)
    const stable = candidates.find((item) => item.variant === 'stable')
    const insiders = candidates.find((item) => item.variant === 'insiders')

    expect(stable?.cliPaths).toContain('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd')
    expect(stable?.extensionDirs[0]).toBe('C:\\Users\\tester\\.vscode\\extensions')
    expect(insiders?.cliPaths).toContain(
      'C:\\Users\\tester\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd'
    )
    expect(insiders?.extensionDirs[0]).toBe('C:\\Users\\tester\\.vscode-insiders\\extensions')
  })

  it('macOS 返回标准应用包和用户 Applications 候选', () => {
    const candidates = getVSCodePathCandidates('darwin', { HOME: '/Users/tester', PATH: '' })
    const stable = candidates.find((item) => item.variant === 'stable')

    expect(stable?.cliPaths).toContain(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    )
    expect(stable?.cliPaths).toContain(
      '/Users/tester/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    )
  })

  it('Linux 返回标准、Snap 与 Flatpak 扩展目录', () => {
    const candidates = getVSCodePathCandidates('linux', { HOME: '/home/tester', PATH: '' })
    const stable = candidates.find((item) => item.variant === 'stable')

    expect(stable?.extensionDirs).toEqual(
      expect.arrayContaining([
        '/home/tester/.vscode/extensions',
        '/home/tester/snap/code/current/.vscode/extensions',
        '/home/tester/.var/app/com.visualstudio.code/data/vscode/extensions'
      ])
    )
  })
})

describe('VSCode 检测', () => {
  it('只检测扩展目录存在的 Stable 版本', async () => {
    const result = await detectVSCodeInstallations({
      runtime: runtime(),
      fs: fakeFileSystem({
        platform: 'win32',
        directories: { 'C:\\Users\\tester\\.vscode\\extensions': [] }
      })
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      variant: 'stable',
      installKind: 'standard',
      installed: false,
      cliPath: null
    })
  })

  it('同时返回 Stable 与 Insiders，而不是只取第一个', async () => {
    const result = await detectVSCodeInstallations({
      runtime: runtime(),
      fs: fakeFileSystem({
        platform: 'win32',
        directories: {
          'C:\\Users\\tester\\.vscode\\extensions': [],
          'C:\\Users\\tester\\.vscode-insiders\\extensions': []
        }
      })
    })

    expect(result.map((item) => item.variant)).toEqual(['stable', 'insiders'])
  })

  it('只有 CLI 而扩展目录不存在时不误报为可安装', async () => {
    const result = await detectVSCodeInstallations({
      runtime: runtime(),
      fs: fakeFileSystem({
        platform: 'win32',
        files: ['C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd']
      })
    })

    expect(result).toEqual([])
  })

  it('多个旧版本目录只识别版本最高的一项', async () => {
    const extensionsDir = 'C:\\Users\\tester\\.vscode\\extensions'
    const newestDir = `${extensionsDir}\\harley-xk.markit-open-1.6.0`
    const result = await detectVSCodeInstallations({
      runtime: runtime(),
      fs: fakeFileSystem({
        platform: 'win32',
        directories: {
          [extensionsDir]: [
            { name: 'harley-xk.markit-open-1.4.0', isDirectory: true },
            { name: 'harley-xk.markit-open-1.6.0', isDirectory: true },
            { name: 'harley-xk.markit-open-1.5.0', isDirectory: true },
            { name: 'harley-xk.markit-open-1.7.0', isDirectory: false }
          ]
        },
        installedAppVersions: { [newestDir]: '1.5.0' }
      })
    })

    expect(result[0]).toMatchObject({
      installed: true,
      installedVersion: '1.6.0',
      installedAppVersion: '1.5.0',
      needsUpdate: false
    })
  })

  it('扩展缺少目录名版本时回退读取 package.json', async () => {
    const extensionsDir = 'C:\\Users\\tester\\.vscode\\extensions'
    const legacyDir = `${extensionsDir}\\harley-xk.markit-open`
    const result = await detectVSCodeInstallations({
      runtime: runtime(),
      fs: fakeFileSystem({
        platform: 'win32',
        directories: {
          [extensionsDir]: [{ name: 'harley-xk.markit-open', isDirectory: true }]
        },
        packageVersions: { [legacyDir]: '1.2.3' }
      })
    })

    expect(result[0]?.installedVersion).toBe('1.2.3')
  })

  it('Linux CLI 属于 Snap 时优先匹配 Snap 扩展目录', async () => {
    const linuxRuntime = runtime({
      platform: 'linux',
      env: { HOME: '/home/tester', PATH: '/snap/bin:/usr/bin' },
      execPath: '/opt/MarkIt/mark-it'
    })
    const result = await detectVSCodeInstallations({
      runtime: linuxRuntime,
      fs: fakeFileSystem({
        platform: 'linux',
        files: ['/snap/bin/code'],
        directories: {
          '/home/tester/.vscode/extensions': [],
          '/home/tester/snap/code/current/.vscode/extensions': []
        }
      })
    })

    expect(result[0]).toMatchObject({
      installKind: 'snap',
      extensionsDir: '/home/tester/snap/code/current/.vscode/extensions'
    })
  })

  it('Linux 无 CLI 时按标准、Snap、Flatpak 顺序选择', async () => {
    const linuxRuntime = runtime({
      platform: 'linux',
      env: { HOME: '/home/tester', PATH: '' },
      execPath: '/opt/MarkIt/mark-it'
    })
    const result = await detectVSCodeInstallations({
      runtime: linuxRuntime,
      fs: fakeFileSystem({
        platform: 'linux',
        directories: {
          '/home/tester/.vscode/extensions': [],
          '/home/tester/snap/code/current/.vscode/extensions': [],
          '/home/tester/.var/app/com.visualstudio.code/data/vscode/extensions': []
        }
      })
    })

    expect(result[0]?.installKind).toBe('standard')
  })

  it('Flatpak 被标记为不支持且不报告已安装', async () => {
    const linuxRuntime = runtime({
      platform: 'linux',
      env: { HOME: '/home/tester', PATH: '' },
      execPath: '/opt/MarkIt/mark-it'
    })
    const result = await detectVSCodeInstallations({
      runtime: linuxRuntime,
      fs: fakeFileSystem({
        platform: 'linux',
        directories: {
          '/home/tester/.var/app/com.visualstudio.code/data/vscode/extensions': [
            { name: 'harley-xk.markit-open-1.5.0', isDirectory: true }
          ]
        }
      })
    })

    expect(result[0]).toMatchObject({
      installKind: 'flatpak',
      installed: false,
      unsupportedReason: 'VSCode 的 Flatpak 沙箱版暂不支持'
    })
  })

  it('开发模式保留检测结果，但全部标记为不可安装', async () => {
    const result = await detectVSCodeInstallations({
      runtime: runtime({ isPackaged: false }),
      fs: fakeFileSystem({
        platform: 'win32',
        directories: { 'C:\\Users\\tester\\.vscode\\extensions': [] }
      })
    })

    expect(result[0]?.unsupportedReason).toContain('开发模式')
  })
})

describe('启动配置与受管目录', () => {
  it('Linux 优先使用 APPIMAGE 稳定路径', () => {
    const config = buildVSCodeIntegrationConfig(
      runtime({
        platform: 'linux',
        env: { APPIMAGE: '/home/tester/Applications/MarkIt.AppImage' },
        execPath: '/tmp/.mount_MarkIt/mark-it'
      })
    )

    expect(config).toMatchObject({
      launchStrategy: 'exec',
      exePath: '/home/tester/Applications/MarkIt.AppImage'
    })
  })

  it('macOS 使用 open-app 并携带应用包路径', () => {
    const config = buildVSCodeIntegrationConfig(
      runtime({
        platform: 'darwin',
        env: {},
        execPath: '/Applications/Mark It.app/Contents/MacOS/Mark It',
        appPath: '/Applications/Mark It.app'
      })
    )

    expect(config).toMatchObject({
      launchStrategy: 'open-app',
      appPath: '/Applications/Mark It.app'
    })
  })

  it('识别 macOS AppTranslocation 路径', () => {
    expect(
      isMacTranslocatedPath(
        '/private/var/folders/ab/cdef/T/AppTranslocation/1234-ABCD/d/Mark It.app/Contents/MacOS/Mark It'
      )
    ).toBe(true)
    expect(isMacTranslocatedPath('/Applications/Mark It.app/Contents/MacOS/Mark It')).toBe(false)
  })

  it('只把固定扩展 ID 的合法目录名视为受管目录', () => {
    expect(isManagedExtensionName('harley-xk.markit-open-1.6.0-beta.4')).toBe(true)
    expect(isManagedExtensionName('harley-xk.markit-open')).toBe(true)
    expect(isManagedExtensionName('harley-xk.markit-open-../other')).toBe(false)
    expect(isManagedExtensionName('other.extension-1.0.0')).toBe(false)
    expect(getManagedExtensionVersion('harley-xk.markit-open-1.6.0')).toBe('1.6.0')
  })

  it('版本比较能把正式版排在预发布版之后', () => {
    expect(compareVersions('1.6.0', '1.6.0-beta.4')).toBe(1)
    expect(compareVersions('1.6.0-beta.4', '1.5.1')).toBe(1)
    expect(compareVersions('1.5.0', '1.5.0')).toBe(0)
  })
})
