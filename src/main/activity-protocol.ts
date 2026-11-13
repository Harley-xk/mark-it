/*
 * 作者: Harley-xk
 * 创建: 2026-11-13
 *
 * 描述: 应用活跃度上报协议，负责签名头、请求体约束、平台与架构映射及响应解析
 */
import { createHmac, randomBytes } from 'crypto'
import { APPHUB_APP_KEY } from './apphub-config'
import type { ActivityEvent } from './activity-store'

export const ACTIVITY_REPORT_PATH = '/api/open/app/activity/report'
export const ACTIVITY_REQUEST_TIMEOUT_MS = 15_000

export interface ActivityReportPayload {
  deviceId: string
  platform: string
  arch?: string
  clientVersion: string
  events: ActivityEvent[]
}

export interface ActivityReportResult {
  accepted: number
  ignored: number
  memberResolved: boolean
}

export interface ActivitySignHeaders extends Record<string, string> {
  'X-App-Key': string
  'X-Device-Id': string
  'Content-Type': string
  sign: string
  timestamp: string
  noncestr: string
}

const PLATFORM_NAMES: Record<string, string> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux'
}

/** 平台标识映射；MarkIt 只发布 windows / macos / linux */
export function detectActivityPlatform(platform: string): string | null {
  return PLATFORM_NAMES[platform] ?? null
}

/** 架构标识最长 16 位；空值或超长时省略，由平台按缺省处理 */
export function normalizeActivityArch(arch: string): string | undefined {
  const normalized = arch.trim()
  if (!normalized || normalized.length > 16) return undefined
  return normalized
}

/** 签名串：METHOD + "\n" + path + "\n" + body + "\n" + timestamp + "\n" + noncestr */
export function buildActivitySignString(
  method: string,
  path: string,
  bodyText: string,
  timestamp: string,
  noncestr: string
): string {
  return [method.toUpperCase(), path, bodyText, timestamp, noncestr].join('\n')
}

/**
 * 构造上报请求头。签名的 body 必须与发送的字符串完全一致；
 * `X-Device-Id` 与请求体 `deviceId` 保持一致，否则限流桶会错位。
 */
export function buildActivityHeaders(
  deviceId: string,
  bodyText: string,
  secret: string,
  options: { timestamp?: string; noncestr?: string } = {}
): ActivitySignHeaders {
  const timestamp = options.timestamp ?? String(Date.now())
  const noncestr = options.noncestr ?? randomBytes(16).toString('hex')
  const sign = createHmac('sha256', secret)
    .update(buildActivitySignString('POST', ACTIVITY_REPORT_PATH, bodyText, timestamp, noncestr))
    .digest('hex')

  return {
    'X-App-Key': APPHUB_APP_KEY,
    'X-Device-Id': deviceId,
    'Content-Type': 'application/json',
    sign,
    timestamp,
    noncestr
  }
}

export class ActivityApiError extends Error {
  readonly code: number
  readonly status: number

  constructor(code: number, message: string, status: number) {
    super(message)
    this.name = 'ActivityApiError'
    this.code = code
    this.status = status
  }
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * 解析上报响应。HTTP 状态与业务 code 一起判断：
 * 非 0 code 抛 ActivityApiError，供调用方区分 429 / 4xx / 应用停用。
 */
export function parseActivityResponse(json: unknown, status: number): ActivityReportResult {
  if (!json || typeof json !== 'object') {
    throw new ActivityApiError(-1, 'Invalid activity response', status)
  }

  const record = json as Record<string, unknown>
  const code = typeof record.code === 'number' ? record.code : -1
  if (code !== 0) {
    const message = typeof record.message === 'string' ? record.message : 'Activity report failed'
    throw new ActivityApiError(code, message, status)
  }

  const data = record.data
  if (!data || typeof data !== 'object') {
    return { accepted: 0, ignored: 0, memberResolved: false }
  }

  const result = data as Record<string, unknown>
  return {
    accepted: readNumber(result.accepted),
    ignored: readNumber(result.ignored),
    memberResolved: result.memberResolved === true
  }
}
