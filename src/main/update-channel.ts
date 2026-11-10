/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 更新通道纯逻辑：通道元数据文件名、版本解析与比较、候选通道选择
 */
import type { UpdateChannel, UpdateStatus } from '../shared/update-types'

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export interface ChannelCandidate {
  channel: UpdateChannel
  version: string
}

/** 版本号只接受本项目的 semver 子集：X.Y.Z 或 X.Y.Z-beta.N */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  }
}

/** semver 预发布比较：正式版最大；数字标识符按数值比较，且小于非数字标识符 */
function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const a = left[i]
    const b = right[i]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue

    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    if (aNumeric) return -1
    if (bNumeric) return 1
    return a < b ? -1 : 1
  }
  return 0
}

/** 比较两个版本：a < b 返回 -1，相等返回 0，a > b 返回 1；非法版本视为最小 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) {
    if (!left && !right) return 0
    return left ? 1 : -1
  }
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

export function isPrerelease(version: string): boolean {
  return (parseVersion(version)?.prerelease.length ?? 0) > 0
}

/** 版本所属通道：含预发布后缀即为 beta */
export function channelOfVersion(version: string): UpdateChannel {
  return isPrerelease(version) ? 'beta' : 'stable'
}

/**
 * 是否允许发起一次性回退。
 * 检测中、下载中、已下载和开发模式下不并发启动；普通更新提示可由回退覆盖。
 */
export function isRollbackStartAllowed(status: UpdateStatus): boolean {
  return (
    status === 'idle' || status === 'available' || status === 'not-available' || status === 'error'
  )
}

/**
 * 是否允许回退：当前必须是预发布版本，且 stable 版本严格低于当前版本。
 * stable 版本缺失、非法或高于当前版本时返回 false。
 */
export function isRollbackTarget(currentVersion: string, stableVersion: string | null): boolean {
  if (!stableVersion || !parseVersion(stableVersion)) return false
  if (!isPrerelease(currentVersion)) return false
  return compareVersions(stableVersion, currentVersion) < 0
}

/** electron-updater 在各平台读取的通道元数据文件名 */
export function channelFileName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
}

/** 从 latest*.yml 顶层读取 version；缺失或非法返回 null */
export function parseChannelVersion(text: string): string | null {
  const match = /^version:[ \t]*['"]?([0-9A-Za-z.-]+)['"]?[ \t]*\r?$/m.exec(text)
  if (!match) return null
  return parseVersion(match[1]) ? match[1] : null
}

/**
 * 从候选通道中选出大于当前版本的最高版本。
 * 同版本时优先 stable（正式版是最终形态）；无候选返回 null。
 */
export function selectUpdateCandidate(
  candidates: ChannelCandidate[],
  currentVersion: string
): ChannelCandidate | null {
  let best: ChannelCandidate | null = null
  for (const candidate of candidates) {
    if (compareVersions(candidate.version, currentVersion) <= 0) continue
    if (!best) {
      best = candidate
      continue
    }
    const diff = compareVersions(candidate.version, best.version)
    if (diff > 0 || (diff === 0 && candidate.channel === 'stable')) best = candidate
  }
  return best
}
