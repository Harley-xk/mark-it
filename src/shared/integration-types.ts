/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: VSCode 编辑器集成的跨进程纯类型
 */

/** VSCode 发行变体 */
export type VSCodeVariant = 'stable' | 'insiders'

/** VSCode 在 Linux 上的发行方式 */
export type VSCodeInstallKind = 'standard' | 'snap' | 'flatpak'

/** 一次文件系统检测得到的 VSCode 安装与扩展状态 */
export interface VSCodeInstallation {
  variant: VSCodeVariant
  installKind: VSCodeInstallKind
  cliPath: string | null
  extensionsDir: string
  installed: boolean
  installedVersion: string | null
  installedAppVersion: string | null
  needsUpdate: boolean
  needsRestart: boolean
  unsupportedReason: string | null
}

/** 安装或卸载扩展的返回结果 */
export interface IntegrationResult {
  ok: boolean
  error?: string
  needsRestart: boolean
}

/** VSCode 扩展启动 MarkIt 时读取的配置 */
export interface VSCodeIntegrationConfig {
  version: 1
  platform: 'win32' | 'darwin' | 'linux'
  launchStrategy: 'exec' | 'open-app'
  exePath: string
  appPath?: string
  updatedAt: string
}
