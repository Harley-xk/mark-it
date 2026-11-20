/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 主进程文件路径归一化、信任集合与受保护目录判定
 */
import { join } from 'path'

/** 统一的路径比较形式：正斜杠；Windows 下忽略大小写与末尾斜杠 */
export function normalizeGuardPath(
  filePath: string,
  platform: NodeJS.Platform = process.platform
): string {
  let value = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\/?$/.test(value)) {
    value = `${value.slice(0, 2)}/`
  } else if (value !== '/') {
    value = value.replace(/\/+$/, '')
  }
  return platform === 'win32' ? value.toLowerCase() : value
}

/** 判断 filePath 是否位于 root 目录内（包含 root 本身） */
export function isWithinRoot(
  filePath: string,
  root: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const target = normalizeGuardPath(filePath, platform)
  const base = normalizeGuardPath(root, platform)
  if (!base) return false
  if (target === base) return true
  return target.startsWith(base.endsWith('/') ? base : `${base}/`)
}

/** 返回 filePath 命中的第一个受保护目录，没有命中时返回 null */
export function findProtectedRoot(
  filePath: string,
  roots: readonly string[],
  platform: NodeJS.Platform = process.platform
): string | null {
  for (const root of roots) {
    if (root && isWithinRoot(filePath, root, platform)) return root
  }
  return null
}

/** 把路径加入信任集合；空值直接忽略 */
export function registerTrustedPath(
  trusted: Set<string>,
  filePath: string | null | undefined,
  platform: NodeJS.Platform = process.platform
): void {
  if (typeof filePath !== 'string' || filePath.length === 0) return
  trusted.add(normalizeGuardPath(filePath, platform))
}

/** 判断路径是否已被用户通过打开 / 保存 / 会话恢复等方式接触过 */
export function isTrustedPath(
  trusted: ReadonlySet<string>,
  filePath: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return trusted.has(normalizeGuardPath(filePath, platform))
}

/**
 * 交给系统默认程序打开时一律拒绝的可执行 / 脚本扩展名。
 * 文档内容不受信任，链接作者可以诱导用户修饰键 + 单击直接执行本地程序；
 * 这类文件仍可通过「在文件夹中显示」后由用户手动决定是否运行。
 */
export const BLOCKED_OPEN_EXTENSION =
  /\.(?:exe|com|bat|cmd|msi|msix|appx|ps1|ps2|vbs|vbe|js|jse|wsf|wsh|hta|cpl|jar|reg|lnk|url|scr|pif|sh|bash|zsh|command|app|dmg|pkg|deb|rpm)$/i

/** 路径是否属于禁止直接交给系统默认程序执行的文件 */
export function isBlockedOpenPath(filePath: string): boolean {
  return BLOCKED_OPEN_EXTENSION.test(filePath)
}

/**
 * 系统开机启动目录。写入这些目录会形成持久化风险，因此一律拒绝。
 * Windows 的 Startup 目录同时存在「当前用户」与「所有用户」两份，这里只保护当前用户路径；
 * 所有用户路径通常需要管理员权限，普通应用无法写入。
 */
export function startupDirectories(
  platform: NodeJS.Platform,
  homeDir: string,
  appDataDir: string
): string[] {
  if (platform === 'win32') {
    return [join(appDataDir, 'Microsoft/Windows/Start Menu/Programs/Startup')]
  }
  if (platform === 'darwin') {
    return [join(homeDir, 'Library/LaunchAgents')]
  }
  return [join(homeDir, '.config/autostart')]
}
