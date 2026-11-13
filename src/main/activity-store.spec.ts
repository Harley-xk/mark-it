import { describe, expect, it } from 'vitest'
import {
  ACTIVATE_THROTTLE_MS,
  ACTIVITY_KEEP_MS,
  ACTIVITY_STATE_VERSION,
  MAX_ACTIVITY_BATCH,
  MAX_ACTIVITY_QUEUE,
  appendActivityEvent,
  createActivityState,
  isValidDeviceId,
  localDateKey,
  parseActivityStateFile,
  pruneActivityQueue,
  serializeActivityState,
  shouldCompensateDay,
  shouldReportActivate,
  takeActivityBatch
} from './activity-store'
import type { ActivityEvent } from './activity-store'

const NOW = Date.UTC(2026, 10, 13, 8, 0, 0)

function event(occurredAt: string, type: ActivityEvent['type'] = 'activate'): ActivityEvent {
  return { type, occurredAt }
}

describe('设备标识', () => {
  it('应接受平台约定的字符集与长度', () => {
    expect(isValidDeviceId('3f1c2a9e-8b7d-4c6a-9e2f-1a2b3c4d5e6f')).toBe(true)
    expect(isValidDeviceId('A_b.c-9')).toBe(true)
    expect(isValidDeviceId('a'.repeat(64))).toBe(true)
  })

  it('应拒绝空值、超长与非法字符', () => {
    expect(isValidDeviceId('')).toBe(false)
    expect(isValidDeviceId('a'.repeat(65))).toBe(false)
    expect(isValidDeviceId('设备-id')).toBe(false)
    expect(isValidDeviceId('has space')).toBe(false)
    expect(isValidDeviceId(123)).toBe(false)
  })
})

describe('状态文件解析', () => {
  it('文件缺失时应生成新的合法设备标识与空队列', () => {
    const state = parseActivityStateFile(null, NOW)
    expect(state.version).toBe(ACTIVITY_STATE_VERSION)
    expect(isValidDeviceId(state.deviceId)).toBe(true)
    expect(state.queue).toEqual([])
    expect(state.lastActivateAt).toBe(0)
  })

  it('JSON 损坏或版本不符时应重建状态', () => {
    expect(parseActivityStateFile('{not json', NOW).queue).toEqual([])
    expect(
      parseActivityStateFile(JSON.stringify({ version: 99, deviceId: 'dev-1' }), NOW).deviceId
    ).not.toBe('dev-1')
  })

  it('设备标识非法时应重新生成，但保留合法事件', () => {
    const raw = JSON.stringify({
      version: 1,
      deviceId: 'bad id',
      lastActivateAt: NOW - 1000,
      activeDay: '2026-11-13',
      queue: [event(new Date(NOW - 1000).toISOString(), 'start')]
    })
    const state = parseActivityStateFile(raw, NOW)
    expect(isValidDeviceId(state.deviceId)).toBe(true)
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0].type).toBe('start')
    expect(state.lastActivateAt).toBe(NOW - 1000)
  })

  it('应丢弃非法事件并规范化时间为 UTC ISO', () => {
    const raw = JSON.stringify({
      version: 1,
      deviceId: 'device-1',
      lastActivateAt: 0,
      activeDay: '2026-11-13',
      queue: [
        { type: 'unknown', occurredAt: new Date(NOW).toISOString() },
        { type: 'activate', occurredAt: 'not-a-date' },
        { type: 'activate', occurredAt: '2026-11-13T09:12:05+08:00' }
      ]
    })
    const state = parseActivityStateFile(raw, NOW)
    expect(state.queue).toEqual([event('2026-11-13T01:12:05.000Z')])
  })

  it('应丢弃超过 7 天的事件', () => {
    const raw = JSON.stringify({
      version: 1,
      deviceId: 'device-1',
      lastActivateAt: 0,
      activeDay: '2026-11-13',
      queue: [
        event(new Date(NOW - ACTIVITY_KEEP_MS - 1).toISOString()),
        event(new Date(NOW - 1000).toISOString())
      ]
    })
    const state = parseActivityStateFile(raw, NOW)
    expect(state.queue).toHaveLength(1)
  })

  it('序列化结果应可被再次解析', () => {
    const state = createActivityState(NOW)
    const next = parseActivityStateFile(serializeActivityState(state), NOW)
    expect(next.deviceId).toBe(state.deviceId)
    expect(next.activeDay).toBe(state.activeDay)
  })
})

describe('队列裁剪', () => {
  it('应只保留最新的 200 条', () => {
    const queue = Array.from({ length: MAX_ACTIVITY_QUEUE + 50 }, (_, index) =>
      event(new Date(NOW - index).toISOString())
    )
    const pruned = pruneActivityQueue(queue, NOW)
    expect(pruned).toHaveLength(MAX_ACTIVITY_QUEUE)
    expect(pruned[0]).toBe(queue[50])
    expect(pruned.at(-1)).toBe(queue.at(-1))
  })

  it('追加事件时同步裁剪过期事件', () => {
    const state = {
      ...createActivityState(NOW),
      queue: [event(new Date(NOW - ACTIVITY_KEEP_MS - 1).toISOString())]
    }
    const next = appendActivityEvent(state, 'activate', NOW)
    expect(next.queue).toEqual([event(new Date(NOW).toISOString())])
    expect(state.queue).toHaveLength(1)
  })

  it('应取不超过 50 条的批次', () => {
    const queue = Array.from({ length: 120 }, (_, index) =>
      event(new Date(NOW + index).toISOString())
    )
    expect(takeActivityBatch(queue)).toHaveLength(MAX_ACTIVITY_BATCH)
    expect(takeActivityBatch(queue, 7)).toHaveLength(7)
  })
})

describe('激活节流与跨天判定', () => {
  it('1 小时内不重复上报 activate，force 可绕过', () => {
    expect(shouldReportActivate(NOW - ACTIVATE_THROTTLE_MS + 1, NOW)).toBe(false)
    expect(shouldReportActivate(NOW - ACTIVATE_THROTTLE_MS, NOW)).toBe(true)
    expect(shouldReportActivate(NOW, NOW, true)).toBe(true)
  })

  it('本地日期翻篇时应触发跨天补偿', () => {
    const localDay = localDateKey(new Date(2026, 10, 13, 23, 59))
    const sameDay = new Date(2026, 10, 13, 23, 59).getTime()
    const nextDay = new Date(2026, 10, 14, 0, 1).getTime()
    expect(shouldCompensateDay(localDay, sameDay)).toBe(false)
    expect(shouldCompensateDay(localDay, nextDay)).toBe(true)
  })

  it('本地日期键应按本地时区格式化', () => {
    expect(localDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
