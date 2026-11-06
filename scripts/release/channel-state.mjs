#!/usr/bin/env node
/**
 * 双通道发版节点工具（零依赖，Node ≥ 18）
 *
 * 用法：
 *   node scripts/release/channel-state.mjs status
 *   node scripts/release/channel-state.mjs channel --version 1.6.0-beta.1
 *   node scripts/release/channel-state.mjs previous-tag --channel beta [--version 1.6.0-beta.2]
 *   node scripts/release/channel-state.mjs validate --version 1.6.0-beta.2
 *
 * tag 是发版节点的唯一记录：v1.6.0 属于 stable，v1.6.0-beta.1 属于 beta。
 */
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const TAG_PREFIX = 'v'
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const BETA_PATTERN = /^\d+\.\d+\.\d+-beta\.\d+$/

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function ok(message) {
  console.log(`✓ ${message}`)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  }
}

function comparePrerelease(left, right) {
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

function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) {
    if (!left && !right) return 0
    return left ? 1 : -1
  }
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

function channelOf(version) {
  return version.includes('-') ? 'beta' : 'stable'
}

/**
 * tag 按版本从高到低排列。
 * - reachableOnly=true：只取当前提交可达的 tag，用于更新说明收集（保证 diff 范围连续）；
 * - reachableOnly=false：取全部 tag，用于严格单序列校验（其它分支发布过的版本也必须计入）。
 */
function listTags(reachableOnly = false) {
  const args = ['tag', '--list', `${TAG_PREFIX}*`]
  if (reachableOnly) args.push('--merged', 'HEAD')
  const raw = git(args)
  if (!raw) return []
  return raw
    .split(/\r?\n/)
    .map((tag) => ({ tag, version: tag.slice(TAG_PREFIX.length) }))
    .filter((item) => parseVersion(item.version))
    .sort((a, b) => compareVersions(b.version, a.version))
}

function maxTag(tags, channel) {
  return tags.find((item) => channelOf(item.version) === channel) ?? null
}

function previousTag(tags, channel, excludeVersion) {
  return (
    tags.find((item) => channelOf(item.version) === channel && item.version !== excludeVersion) ??
    null
  )
}

function bumpPatch(version) {
  const parsed = parseVersion(version)
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function bumpBeta(version) {
  const match = /^(.*-beta\.)(\d+)$/.exec(version)
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${version.split('-')[0]}-beta.1`
}

function suggestNext(tags) {
  const lastStable = maxTag(tags, 'stable')
  const lastBeta = maxTag(tags, 'beta')
  const lastStableVersion = lastStable?.version ?? null
  const lastBetaBase = lastBeta ? lastBeta.version.split('-')[0] : null

  let nextStable = '—'
  let nextBeta = '—'
  if (
    lastBetaBase &&
    (!lastStableVersion || compareVersions(lastBetaBase, lastStableVersion) > 0)
  ) {
    // 当前 beta 线高于正式版：下一个正式版就是它的 base
    nextStable = lastBetaBase
    nextBeta = bumpBeta(lastBeta.version)
  } else if (lastStableVersion) {
    nextStable = bumpPatch(lastStableVersion)
    nextBeta = `${bumpPatch(lastStableVersion)}-beta.1`
  }
  return { nextStable, nextBeta }
}

function cmdStatus() {
  const tags = listTags(true)
  console.log('发版节点（tag 为唯一记录）：')
  for (const channel of ['stable', 'beta']) {
    const last = maxTag(tags, channel)
    if (!last) {
      console.log(`  ${channel.padEnd(6)} 无已发布版本`)
      continue
    }
    const date = git(['log', '-1', '--format=%cs', last.tag])
    const count = git(['rev-list', '--count', `${last.tag}..HEAD`])
    console.log(`  ${channel.padEnd(6)} ${last.tag}（${date}），自该节点起 ${count} 个提交`)
    const subjects = git(['log', `${last.tag}..HEAD`, '--no-merges', '--pretty=- %s'])
    if (subjects) {
      console.log(
        subjects
          .split(/\r?\n/)
          .map((line) => `         ${line}`)
          .join('\n')
      )
    }
  }

  const { nextStable, nextBeta } = suggestNext(tags)
  console.log('')
  console.log(`建议下一个版本：stable ${nextStable} / beta ${nextBeta}`)
  console.log('提示：beta 的 base 必须严格大于最后一个正式版；功能较多的 beta 线可自行升 minor。')
  console.log("查看待收录提交：git log <上一个同通道 tag>..HEAD --no-merges --pretty='- %s'")
}

function cmdChannel(version) {
  if (!parseVersion(version)) fail(`版本号不合法：${version}`)
  console.log(channelOf(version))
}

function cmdPreviousTag(channel, version) {
  if (channel !== 'stable' && channel !== 'beta')
    fail(`--channel 只能是 stable 或 beta：${channel}`)
  const tag = previousTag(listTags(true), channel, version)
  console.log(tag ? tag.tag : '')
}

function cmdValidate(version) {
  const parsed = parseVersion(version)
  if (!parsed) fail(`版本号不合法：${version}`)
  if (version.includes('-') && !BETA_PATTERN.test(version)) {
    fail(`预发布版本只允许 -beta.N 形式：${version}`)
  }

  const channel = channelOf(version)
  // 严格单序列按「全部 tag」校验：其它分支发布过的更高版本也必须计入
  const tags = listTags()
  const newer = tags.find(
    (item) => item.version !== version && compareVersions(item.version, version) >= 0
  )
  if (newer) {
    fail(
      `版本 ${version} 不满足严格单序列：已存在 ${newer.tag}（任何新版本必须大于已发布的全部版本）`
    )
  }

  if (channel === 'beta') {
    const lastStable = maxTag(tags, 'stable')
    const base = version.split('-')[0]
    if (lastStable && compareVersions(base, lastStable.version) <= 0) {
      fail(`beta base ${base} 必须严格大于最后一个正式版 ${lastStable.version}`)
    }
  }

  // 更新说明的收集起点只取当前分支可达的 tag，保证 diff 范围连续
  const prev = previousTag(listTags(true), channel, version)
  ok(`版本校验通过：${channel} / ${version}`)
  console.log(`  上一个同通道节点：${prev ? prev.tag : '无'}`)
}

const USAGE = `用法：
  node scripts/release/channel-state.mjs status
  node scripts/release/channel-state.mjs channel --version <semver>
  node scripts/release/channel-state.mjs previous-tag --channel <stable|beta> [--version <semver>]
  node scripts/release/channel-state.mjs validate --version <semver>`

function main() {
  let parsed
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        version: { type: 'string' },
        channel: { type: 'string' }
      },
      allowPositionals: true,
      strict: true
    })
  } catch (error) {
    fail(`参数解析失败：${error.message}\n${USAGE}`)
  }

  const command = parsed.positionals[0]
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  const version = parsed.values.version
  switch (command) {
    case 'status':
      cmdStatus()
      return
    case 'channel':
      if (!version) fail('缺少必填参数 --version')
      cmdChannel(version)
      return
    case 'previous-tag':
      if (!parsed.values.channel) fail('缺少必填参数 --channel')
      cmdPreviousTag(parsed.values.channel, version)
      return
    case 'validate':
      if (!version) fail('缺少必填参数 --version')
      cmdValidate(version)
      return
    default:
      fail(`未知子命令：${command}\n${USAGE}`)
  }
}

main()
