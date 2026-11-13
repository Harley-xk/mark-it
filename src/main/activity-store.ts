/*
 * 作者: Harley-xk
 * 创建: 2026-11-13
 *
 * 描述: 应用活跃度上报的本地状态模型与纯函数，负责设备标识、队列裁剪、节流与跨天判定
 */
import { randomUUID } from 'crypto'

export type ActivityEventType = 'start' | 'activate' | 'stop'

export interface ActivityEvent {
  type: ActivityEventType
  occurredAt: string
}

export interface ActivityState {
  version: 1
  deviceId: string
  lastActivateAt: number
  activeDay: string
  queue: ActivityEvent[]
}

export const ACTIVITY_STATE_VERSION = 1
/** 同一设备 1 小时内只上报一次 activate（强制场景除外） */
export const ACTIVATE_THROTTLE_MS = 60 * 60 * 1000
export const MAX_ACTIVITY_QUEUE = 200
export const MAX_ACTIVITY_BATCH = 50
export const ACTIVITY_KEEP_MS = 7 * 24 * 60 * 60 * 1000

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EVENT_TYPES: readonly ActivityEventType[] = ['start', 'activate', 'stop']

/** 设备标识只允许平台约定的字符集与长度 */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value)
}

/** 本地自然日键（YYYY-MM-DD），用于跨天补偿 */
export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createActivityState(now = Date.now()): ActivityState {
  return {
    version: ACTIVITY_STATE_VERSION,
    deviceId: randomUUID(),
    lastActivateAt: 0,
    activeDay: localDateKey(new Date(now)),
    queue: []
  }
}

function normalizeEvent(value: unknown): ActivityEvent | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const type = record.type
  const occurredAt = record.occurredAt
  if (typeof type !== 'string' || !EVENT_TYPES.includes(type as ActivityEventType)) return null
  if (typeof occurredAt !== 'string') return null
  const time = Date.parse(occurredAt)
  if (!Number.isFinite(time)) return null
  return { type: type as ActivityEventType, occurredAt: new Date(time).toISOString() }
}

/** 丢弃 7 天外的事件，并保留最新的 200 条 */
export function pruneActivityQueue(queue: ActivityEvent[], now = Date.now()): ActivityEvent[] {
  const cutoff = now - ACTIVITY_KEEP_MS
  const recent = queue.filter((event) => {
    const time = Date.parse(event.occurredAt)
    return Number.isFinite(time) && time >= cutoff
  })
  return recent.slice(-MAX_ACTIVITY_QUEUE)
}

/**
 * 解析状态文件。文件缺失 / 损坏 / 版本不符时重建；单个事件非法只丢弃该事件。
 * 设备标识非法时重新生成，但保留仍合法的事件队列。
 */
export function parseActivityStateFile(raw: string | null, now = Date.now()): ActivityState {
  const fallback = createActivityState(now)
  if (!raw) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (!parsed || typeof parsed !== 'object') return fallback

  const record = parsed as Record<string, unknown>
  if (record.version !== ACTIVITY_STATE_VERSION) return fallback

  const deviceId = isValidDeviceId(record.deviceId) ? record.deviceId : fallback.deviceId
  const lastActivateAt =
    typeof record.lastActivateAt === 'number' &&
    Number.isFinite(record.lastActivateAt) &&
    record.lastActivateAt > 0
      ? record.lastActivateAt
      : 0
  const activeDay =
    typeof record.activeDay === 'string' && LOCAL_DAY_PATTERN.test(record.activeDay)
      ? record.activeDay
      : localDateKey(new Date(now))
  const rawQueue = Array.isArray(record.queue) ? record.queue : []
  const events = rawQueue
    .map(normalizeEvent)
    .filter((event): event is ActivityEvent => event !== null)

  return {
    version: ACTIVITY_STATE_VERSION,
    deviceId,
    lastActivateAt,
    activeDay,
    queue: pruneActivityQueue(events, now)
  }
}

export function serializeActivityState(state: ActivityState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

/** 追加事件并按 7 天 / 200 条规则裁剪 */
export function appendActivityEvent(
  state: ActivityState,
  type: ActivityEventType,
  now = Date.now()
): ActivityState {
  const event: ActivityEvent = { type, occurredAt: new Date(now).toISOString() }
  return { ...state, queue: pruneActivityQueue([...state.queue, event], now) }
}

/** 是否允许上报 activate：force 用于冷启动首次可见与跨天补偿，否则受 1 小时节流 */
export function shouldReportActivate(
  lastActivateAt: number,
  now = Date.now(),
  force = false
): boolean {
  if (force) return true
  return now - lastActivateAt >= ACTIVATE_THROTTLE_MS
}

/** 本地日期是否已翻篇 */
export function shouldCompensateDay(activeDay: string, now = Date.now()): boolean {
  return activeDay !== localDateKey(new Date(now))
}

/** 取下一批待上报事件（平台单批上限 50 条） */
export function takeActivityBatch(
  queue: ActivityEvent[],
  size = MAX_ACTIVITY_BATCH
): ActivityEvent[] {
  return queue.slice(0, Math.max(1, size))
}
