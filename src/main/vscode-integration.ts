/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 检测 VSCode、安装或卸载 MarkIt 扩展，并同步扩展启动配置
 */

import { constants } from 'fs'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join, posix, resolve, win32 } from 'path'
import { randomUUID } from 'crypto'
import type {
  IntegrationResult,
  VSCodeInstallation,
  VSCodeInstallKind,
  VSCodeIntegrationConfig,
  VSCodeVariant
} from '../shared/integration-types'

const EXTENSION_PREFIX = 'harley-xk.markit-open'
const MANAGED_EXTENSION_NAME = /^harley-xk\.markit-open(?:-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)?$/
const SUPPORTED_PLATFORM = new Set(['win32', 'darwin', 'linux'])
const VARIANT_NAMES: Record<VSCodeVariant, string> = {
  stable: 'VSCode',
  insiders: 'VSCode Insiders'
}

type SupportedPlatform = VSCodeIntegrationConfig['platform']

interface VSCodePathCandidates {
  variant: VSCodeVariant
  cliPaths: string[]
  extensionDirs: string[]
}

interface DirectoryEntryInfo {
  name: string
  isDirectory: boolean
}

export interface IntegrationRuntime {
  platform: SupportedPlatform
  env: NodeJS.ProcessEnv
  userDataDir: string
  appVersion: string
  isPackaged: boolean
  execPath: string
  appPath?: string
  extensionSourcePaths: string[]
}

interface IntegrationFileSystem {
  isFile: (targetPath: string) => Promise<boolean>
  isDirectory: (targetPath: string) => Promise<boolean>
  readDir: (targetPath: string) => Promise<DirectoryEntryInfo[]>
  readPackageVersion: (extensionDir: string) => Promise<string | null>
  readInstalledAppVersion: (extensionDir: string) => Promise<string | null>
}

export interface DetectVSCodeOptions {
  runtime: IntegrationRuntime
  fs?: Partial<IntegrationFileSystem>
}

export interface InstallVSCodeOptions extends DetectVSCodeOptions {
  extensionSourceDir?: string
}

/** 路径归一，仅用于当前平台的大小写与分隔符比较 */
export function normalizeIntegrationPath(targetPath: string, platform: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** 解析固定扩展目录名中的版本；不符合受管命名时返回 null */
export function getManagedExtensionVersion(directoryName: string): string | null {
  if (!MANAGED_EXTENSION_NAME.test(directoryName)) return null
  const match = /^harley-xk\.markit-open-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(directoryName)
  return match?.[1] ?? null
}

export function isManagedExtensionName(directoryName: string): boolean {
  return MANAGED_EXTENSION_NAME.test(directoryName)
}

/** 简单语义版本比较，足够选择扩展目录；非法段回退为 0 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string): { core: number[]; prerelease: string[] } => {
    const [corePart, prereleasePart = ''] = version.split('-', 2)
    const core = corePart.split('.').map((part) => {
      const value = Number.parseInt(part, 10)
      return Number.isFinite(value) ? value : 0
    })
    while (core.length < 3) core.push(0)
    return { core, prerelease: prereleasePart ? prereleasePart.split('.') : [] }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1
  for (
    let index = 0;
    index < Math.max(left.prerelease.length, right.prerelease.length);
    index += 1
  ) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === rightPart) continue
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftPart.localeCompare(rightPart)
  }
  return 0
}

function homeDirectory(env: NodeJS.ProcessEnv): string {
  return env['USERPROFILE'] || env['HOME'] || ''
}

function deduplicatePaths(paths: string[], platform: SupportedPlatform): string[] {
  const seen = new Set<string>()
  return paths.filter((targetPath) => {
    if (!targetPath) return false
    const key = normalizeIntegrationPath(targetPath, platform)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pathCommandCandidates(
  command: string,
  platform: SupportedPlatform,
  env: NodeJS.ProcessEnv
): string[] {
  const joinPath = platform === 'win32' ? win32.join : posix.join
  const directories = (env['PATH'] ?? '').split(platform === 'win32' ? ';' : ':')
  const names =
    platform === 'win32'
      ? [
          command,
          ...(env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD')
            .split(';')
            .filter(Boolean)
            .map((extension) => `${command}${extension.toLowerCase()}`)
        ]
      : [command]
  return directories.flatMap((directory) =>
    directory ? names.map((name) => joinPath(directory, name)) : []
  )
}

/** 生成 VSCode Stable / Insiders 的 CLI 与扩展目录候选，不访问文件系统 */
export function getVSCodePathCandidates(
  platform: SupportedPlatform,
  env: NodeJS.ProcessEnv
): VSCodePathCandidates[] {
  const joinPath = platform === 'win32' ? win32.join : posix.join
  const home = homeDirectory(env)
  const localAppData = env['LOCALAPPDATA'] ?? (home ? joinPath(home, 'AppData', 'Local') : '')
  const appData = env['APPDATA'] ?? ''
  const result: VSCodePathCandidates[] = []

  const stableCli = ['code']
  const insidersCli = ['code-insiders']
  const stableExtensionDirs: string[] = []
  const insidersExtensionDirs: string[] = []

  if (platform === 'win32') {
    stableCli.push(
      joinPath(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
      joinPath(appData, '..', 'Local', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd')
    )
    insidersCli.push(
      joinPath(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd')
    )
    for (const programFiles of [env['ProgramFiles'], env['ProgramFiles(x86)']]) {
      if (programFiles) {
        stableCli.push(joinPath(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'))
        insidersCli.push(
          joinPath(programFiles, 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd')
        )
      }
    }
    stableExtensionDirs.push(joinPath(home, '.vscode', 'extensions'))
    insidersExtensionDirs.push(joinPath(home, '.vscode-insiders', 'extensions'))
  } else if (platform === 'darwin') {
    stableCli.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      joinPath(home, 'Applications', 'Visual Studio Code.app/Contents/Resources/app/bin/code')
    )
    insidersCli.push(
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders',
      joinPath(
        home,
        'Applications',
        'Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders'
      )
    )
    stableExtensionDirs.push(joinPath(home, '.vscode', 'extensions'))
    insidersExtensionDirs.push(joinPath(home, '.vscode-insiders', 'extensions'))
  } else {
    stableCli.push('/usr/share/code/bin/code', '/snap/bin/code')
    insidersCli.push('/usr/share/code-insiders/bin/code-insiders', '/snap/bin/code-insiders')
    stableExtensionDirs.push(
      joinPath(home, '.vscode', 'extensions'),
      joinPath(home, 'snap', 'code', 'current', '.vscode', 'extensions'),
      joinPath(home, '.var', 'app', 'com.visualstudio.code', 'data', 'vscode', 'extensions')
    )
    insidersExtensionDirs.push(
      joinPath(home, '.vscode-insiders', 'extensions'),
      joinPath(home, 'snap', 'code-insiders', 'current', '.vscode-insiders', 'extensions'),
      joinPath(
        home,
        '.var',
        'app',
        'com.visualstudio.code.insiders',
        'data',
        'vscode',
        'extensions'
      )
    )
  }

  for (const [variant, commands, knownCli, extensionDirs] of [
    ['stable', stableCli[0], stableCli.slice(1), stableExtensionDirs],
    ['insiders', insidersCli[0], insidersCli.slice(1), insidersExtensionDirs]
  ] as const) {
    result.push({
      variant,
      cliPaths: deduplicatePaths(
        [...pathCommandCandidates(commands, platform, env), ...knownCli],
        platform
      ),
      extensionDirs: deduplicatePaths(extensionDirs, platform)
    })
  }
  return result
}

/** 判断扩展目录属于标准、Snap 还是 Flatpak 安装 */
export function getInstallKind(
  extensionDir: string,
  platform: SupportedPlatform
): VSCodeInstallKind {
  if (platform !== 'linux') return 'standard'
  const normalized = normalizeIntegrationPath(extensionDir, platform)
  if (/\/snap\/(?:code|code-insiders)\//.test(normalized)) return 'snap'
  if (/\/\.var\/app\/com\.visualstudio\.code(?:\.insiders)?\//.test(normalized)) {
    return 'flatpak'
  }
  return 'standard'
}

/** macOS 从只读 DMG 直接运行时位于 AppTranslocation，禁止写扩展配置 */
export function isMacTranslocatedPath(targetPath: string): boolean {
  return /\/private\/var\/folders\/.*\/AppTranslocation\//i.test(targetPath.replace(/\\/g, '/'))
}

function kindFromCli(
  cliPath: string | null,
  platform: SupportedPlatform
): VSCodeInstallKind | null {
  if (!cliPath || platform !== 'linux') return null
  const normalized = normalizeIntegrationPath(cliPath, platform)
  if (normalized.startsWith('/snap/') || normalized.includes('/snap/bin/')) return 'snap'
  if (normalized.includes('/.var/app/')) return 'flatpak'
  return 'standard'
}

function findHighestInstalledExtension(
  entries: DirectoryEntryInfo[]
): { name: string; version: string | null } | null {
  let selected: { name: string; version: string | null } | null = null
  for (const entry of entries) {
    if (!entry.isDirectory || !isManagedExtensionName(entry.name)) continue
    const version = getManagedExtensionVersion(entry.name)
    if (!selected) {
      selected = { name: entry.name, version }
      continue
    }
    if (version && (!selected.version || compareVersions(version, selected.version) > 0)) {
      selected = { name: entry.name, version }
    }
  }
  return selected
}

function defaultFileSystem(): IntegrationFileSystem {
  return {
    isFile: async (targetPath) => {
      try {
        return (await stat(targetPath)).isFile()
      } catch {
        return false
      }
    },
    isDirectory: async (targetPath) => {
      try {
        return (await stat(targetPath)).isDirectory()
      } catch {
        return false
      }
    },
    readDir: async (targetPath) => {
      try {
        const entries = await readdir(targetPath, { withFileTypes: true })
        return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      } catch {
        return []
      }
    },
    readPackageVersion: async (extensionDir) => {
      try {
        const manifest = JSON.parse(
          await readFile(join(extensionDir, 'package.json'), 'utf-8')
        ) as {
          version?: unknown
        }
        return typeof manifest.version === 'string' ? manifest.version : null
      } catch {
        return null
      }
    },
    readInstalledAppVersion: async (extensionDir) => {
      try {
        const install = JSON.parse(await readFile(join(extensionDir, 'install.json'), 'utf-8')) as {
          appVersion?: unknown
        }
        return typeof install.appVersion === 'string' ? install.appVersion : null
      } catch {
        return null
      }
    }
  }
}

/**
 * 检测本机 VSCode 与 MarkIt 扩展。文件系统仅作为边界注入，
 * 检测规则本身可在 Vitest 中覆盖三平台与目录优先级。
 */
export async function detectVSCodeInstallations(
  options: DetectVSCodeOptions
): Promise<VSCodeInstallation[]> {
  const { runtime } = options
  const fileSystem: IntegrationFileSystem = { ...defaultFileSystem(), ...options.fs }
  const candidates = getVSCodePathCandidates(runtime.platform, runtime.env)
  const result: VSCodeInstallation[] = []
  const globalUnsupportedReason = !runtime.isPackaged
    ? '开发模式暂不支持，请使用打包产物验证'
    : runtime.platform === 'darwin' && isMacTranslocatedPath(runtime.execPath)
      ? '请先将 MarkIt 移入「应用程序」后再使用编辑器集成'
      : null

  for (const candidate of candidates) {
    let cliPath: string | null = null
    for (const possibleCli of candidate.cliPaths) {
      if (await fileSystem.isFile(possibleCli)) {
        cliPath = possibleCli
        break
      }
    }

    const existingDirs: { path: string; kind: VSCodeInstallKind; entries: DirectoryEntryInfo[] }[] =
      []
    for (const extensionDir of candidate.extensionDirs) {
      if (!(await fileSystem.isDirectory(extensionDir))) continue
      const entries = await fileSystem.readDir(extensionDir)
      existingDirs.push({
        path: extensionDir,
        kind: getInstallKind(extensionDir, runtime.platform),
        entries
      })
    }
    if (existingDirs.length === 0) continue

    const cliKind = kindFromCli(cliPath, runtime.platform)
    const selectedDir =
      (cliKind && existingDirs.find((item) => item.kind === cliKind)) || existingDirs[0]
    const installKind = selectedDir.kind
    const flatpakUnsupported =
      installKind === 'flatpak'
        ? `${VARIANT_NAMES[candidate.variant]} 的 Flatpak 沙箱版暂不支持`
        : null
    const unsupportedReason = globalUnsupportedReason ?? flatpakUnsupported
    const installedExtension = flatpakUnsupported
      ? null
      : findHighestInstalledExtension(selectedDir.entries)
    let installedVersion = installedExtension?.version ?? null
    let installedAppVersion: string | null = null
    if (installedExtension) {
      const installedDir = join(selectedDir.path, installedExtension.name)
      installedVersion ??= await fileSystem.readPackageVersion(installedDir)
      installedAppVersion = await fileSystem.readInstalledAppVersion(installedDir)
    }

    result.push({
      variant: candidate.variant,
      installKind,
      cliPath,
      extensionsDir: selectedDir.path,
      installed: Boolean(installedExtension),
      installedVersion,
      installedAppVersion,
      needsUpdate: Boolean(installedExtension) && installedAppVersion !== runtime.appVersion,
      needsRestart: false,
      unsupportedReason
    })
  }
  return result
}

/** 根据当前平台生成扩展启动配置；macOS 使用 LaunchServices 策略 */
export function buildVSCodeIntegrationConfig(runtime: IntegrationRuntime): VSCodeIntegrationConfig {
  const appPath = runtime.appPath
  return {
    version: 1,
    platform: runtime.platform,
    launchStrategy: runtime.platform === 'darwin' && appPath ? 'open-app' : 'exec',
    exePath:
      runtime.platform === 'linux' && runtime.env['APPIMAGE']
        ? runtime.env['APPIMAGE']
        : runtime.execPath,
    ...(runtime.platform === 'darwin' && appPath ? { appPath } : {}),
    updatedAt: new Date().toISOString()
  }
}

async function buildValidatedIntegrationConfig(
  runtime: IntegrationRuntime
): Promise<VSCodeIntegrationConfig> {
  const config = buildVSCodeIntegrationConfig(runtime)
  if (runtime.platform === 'linux' && runtime.env['APPIMAGE'] === config.exePath) {
    try {
      await access(config.exePath, constants.X_OK)
    } catch {
      config.exePath = runtime.execPath
    }
  }
  return config
}

/** 每次 MarkIt 启动后同步主配置，应用移动安装位置后可自愈 */
export async function writeVSCodeIntegrationConfig(runtime: IntegrationRuntime): Promise<boolean> {
  if (runtime.platform === 'darwin' && isMacTranslocatedPath(runtime.execPath)) return false
  const configPath = join(runtime.userDataDir, 'vscode-integration.json')
  await mkdir(runtime.userDataDir, { recursive: true })
  const config = await buildValidatedIntegrationConfig(runtime)
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  return true
}

function extensionDestination(extensionsDir: string, version: string): string {
  const destination = join(extensionsDir, `${EXTENSION_PREFIX}-${version}`)
  if (
    dirname(destination) !== extensionsDir ||
    !isManagedExtensionName(`${EXTENSION_PREFIX}-${version}`)
  ) {
    throw new Error('非法扩展安装路径')
  }
  return destination
}

async function resolveExtensionSource(options: InstallVSCodeOptions): Promise<string> {
  const candidates = options.extensionSourceDir
    ? [options.extensionSourceDir]
    : options.runtime.extensionSourcePaths
  for (const source of candidates) {
    try {
      await access(join(source, 'package.json'), constants.R_OK)
      await access(join(source, 'extension.js'), constants.R_OK)
      return source
    } catch {
      // 尝试下一个开发 / 解包路径
    }
  }
  throw new Error('未找到随应用分发的 VSCode 扩展资源')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 安装固定 ID 的扩展；先写暂存目录，再替换受管旧版本 */
export async function installVSCodeExtension(
  variant: VSCodeVariant,
  options: InstallVSCodeOptions
): Promise<IntegrationResult> {
  try {
    if (variant !== 'stable' && variant !== 'insiders') {
      return { ok: false, error: '不支持的 VSCode 类型', needsRestart: false }
    }
    if (!options.runtime.isPackaged) {
      return {
        ok: false,
        error: '开发模式暂不支持编辑器集成，请使用打包产物验证',
        needsRestart: false
      }
    }
    const installation = (await detectVSCodeInstallations(options)).find(
      (item) => item.variant === variant
    )
    if (!installation) {
      return { ok: false, error: '未检测到对应的 VSCode', needsRestart: false }
    }
    if (installation.unsupportedReason) {
      return { ok: false, error: installation.unsupportedReason, needsRestart: false }
    }

    const sourceDir = await resolveExtensionSource(options)
    const version = options.runtime.appVersion
    const destination = extensionDestination(installation.extensionsDir, version)
    const staged = join(installation.extensionsDir, `.markit-open-stage-${randomUUID()}`)
    const launchConfig = await buildValidatedIntegrationConfig(options.runtime)

    await mkdir(installation.extensionsDir, { recursive: true })
    try {
      await cp(sourceDir, staged, { recursive: true, force: true })
      const stagedManifestPath = join(staged, 'package.json')
      const stagedManifest = JSON.parse(await readFile(stagedManifestPath, 'utf-8')) as Record<
        string,
        unknown
      >
      stagedManifest['version'] = version
      await writeFile(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`, 'utf-8')
      await writeFile(
        join(staged, 'markit-path.json'),
        `${JSON.stringify(launchConfig, null, 2)}\n`,
        'utf-8'
      )
      await writeFile(
        join(staged, 'install.json'),
        `${JSON.stringify(
          {
            appVersion: options.runtime.appVersion,
            extensionVersion: version,
            installedAt: new Date().toISOString()
          },
          null,
          2
        )}\n`,
        'utf-8'
      )
      await writeVSCodeIntegrationConfig(options.runtime)

      const entries = await readdir(installation.extensionsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && isManagedExtensionName(entry.name)) {
          await rm(join(installation.extensionsDir, entry.name), { recursive: true, force: true })
        }
      }
      await rename(staged, destination)
    } catch (error) {
      await rm(staged, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    return { ok: true, needsRestart: true }
  } catch (error) {
    console.error('Failed to install VSCode integration:', error)
    return { ok: false, error: errorMessage(error), needsRestart: false }
  }
}

/** 关闭集成开关时只删除固定 ID 的受管扩展目录 */
export async function uninstallVSCodeExtension(
  variant: VSCodeVariant,
  options: DetectVSCodeOptions
): Promise<IntegrationResult> {
  try {
    if (variant !== 'stable' && variant !== 'insiders') {
      return { ok: false, error: '不支持的 VSCode 类型', needsRestart: false }
    }
    const installation = (await detectVSCodeInstallations(options)).find(
      (item) => item.variant === variant
    )
    if (!installation) {
      return { ok: true, needsRestart: false }
    }
    const entries = await readdir(installation.extensionsDir, { withFileTypes: true }).catch(
      () => []
    )
    let removed = false
    for (const entry of entries) {
      if (!entry.isDirectory() || !isManagedExtensionName(entry.name)) continue
      await rm(join(installation.extensionsDir, entry.name), { recursive: true, force: true })
      removed = true
    }
    return { ok: true, needsRestart: removed }
  } catch (error) {
    console.error('Failed to uninstall VSCode integration:', error)
    return { ok: false, error: errorMessage(error), needsRestart: false }
  }
}

/** 构造主进程运行时；资源路径同时覆盖开发目录与 asarUnpack 产物 */
export function createIntegrationRuntime(input: {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  userDataDir: string
  appVersion: string
  isPackaged: boolean
  execPath: string
  extensionSourcePaths: string[]
}): IntegrationRuntime {
  const platform = SUPPORTED_PLATFORM.has(input.platform)
    ? (input.platform as SupportedPlatform)
    : 'linux'
  const macAppPath = platform === 'darwin' ? resolve(dirname(input.execPath), '../..') : undefined
  return {
    platform,
    env: input.env,
    userDataDir: input.userDataDir,
    appVersion: input.appVersion,
    isPackaged: input.isPackaged,
    execPath: input.execPath,
    appPath: macAppPath,
    extensionSourcePaths: input.extensionSourcePaths.map((item) => resolve(item))
  }
}
