/*
 * 作者: Harley-xk
 * 创建: 2026-11-13
 *
 * 描述: 应用活跃度上报，负责窗口生命周期挂钩、1 小时节流、跨天补偿、离线队列与批量刷新
 */
import { app, BrowserWindow, net } from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { APPHUB_BASE_URL } from './apphub-config'
import {
  ACTIVITY_REPORT_PATH,
  ACTIVITY_REQUEST_TIMEOUT_MS,
  ActivityApiError,
  buildActivityHeaders,
  detectActivityPlatform,
  normalizeActivityArch,
  parseActivityResponse
} from './activity-protocol'
import {
  appendActivityEvent,
  localDateKey,
  parseActivityStateFile,
  serializeActivityState,
  shouldCompensateDay,
  shouldReportActivate,
  takeActivityBatch
} from './activity-store'
import type { ActivityEvent, ActivityEventType, ActivityState } from './activity-store'

const STATE_FILE_NAME = 'activity-state.json'
/** 入队后的刷新防抖；单条 activate 不需要立即发请求 */
const FLUSH_DEBOUNCE_MS = 3_000
/** 队列达到该条数时立即刷新 */
const FLUSH_THRESHOLD = 10
/** 网络失败后的重试间隔；事件仍在本地队列中，不会丢失 */
const NETWORK_RETRY_MS = 5 * 60 * 1000
/** 正常退出时 stop 的去重窗口，避免退出被取消后重复入队 */
const STOP_DEDUPE_MS = 60 * 1000
/** 跨天检查周期 */
const DAY_CHECK_INTERVAL_MS = 60 * 1000
/** 平台应用停用错误码：停止本次进程后续上报 */
const APP_UNAVAILABLE_CODE = 700300003

let reporter: ActivityReporter | null = null

function readStateFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

/** 私有化 / 联调环境可覆盖服务基址；未设置时使用线上基址 */
function resolveBaseUrl(): string {
  const override = process.env['MARKIT_ACTIVITY_BASE_URL']?.trim()
  return override ? override.replace(/\/+$/, '') : APPHUB_BASE_URL
}

/** 开发模式默认不参与正式统计；需要联调时设置 MARKIT_ACTIVITY_REPORT=force */
function isReportingEnabled(secret: string): boolean {
  if (!secret) {
    if (app.isPackaged) console.warn('Activity reporting disabled: missing app secret')
    return false
  }
  if (!app.isPackaged && process.env['MARKIT_ACTIVITY_REPORT'] !== 'force') return false
  if (!detectActivityPlatform(process.platform)) {
    console.warn('Activity reporting disabled: unsupported platform', process.platform)
    return false
  }
  return true
}

class ActivityReporter {
  private state: ActivityState
  private enabled: boolean
  private started = false
  private flushing = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushAt = 0
  private dayTimer: ReturnType<typeof setInterval> | null = null
  private retryAt = 0
  private lastStopAt = 0
  private readonly warnedCodes = new Set<number>()

  constructor(
    private readonly stateFile: string,
    private readonly secret: string,
    private readonly baseUrl: string,
    enabled: boolean
  ) {
    this.enabled = enabled
    this.state = parseActivityStateFile(readStateFile(stateFile))
  }

  init(): void {
    if (!this.enabled) return

    app.on('browser-window-focus', () => this.onWindowFocus())
    app.on('before-quit', () => this.onExit())

    this.dayTimer = setInterval(() => this.checkDayRollover(), DAY_CHECK_INTERVAL_MS)
    this.dayTimer.unref()

    // 首次启动立即落盘 deviceId，保证重启后设备标识不变
    this.persist()
    if (this.state.queue.length > 0) this.scheduleFlush(0)
  }

  /** 首个编辑窗口对用户可见：每个进程只发一次 start，并强制补一条 activate */
  onWindowShown(): void {
    if (!this.enabled || this.started) return
    this.started = true
    this.enqueue('start')
    this.onWindowFocus(true)
  }

  /** 窗口获得焦点；force 用于冷启动、跨天补偿与后续会员登录场景 */
  private onWindowFocus(force = false): void {
    if (!this.enabled || !this.started) return
    const now = Date.now()
    if (!shouldReportActivate(this.state.lastActivateAt, now, force)) return

    this.state = {
      ...this.state,
      lastActivateAt: now,
      activeDay: localDateKey(new Date(now))
    }
    this.enqueue('activate')
  }

  /** 窗口保持聚焦时跨过本地自然日，补一条不受节流限制的 activate */
  private checkDayRollover(): void {
    if (!this.enabled || !this.started) return
    const now = Date.now()
    if (!shouldCompensateDay(this.state.activeDay, now)) return

    const focused = BrowserWindow.getFocusedWindow()
    if (!focused || focused.isDestroyed() || !focused.isVisible()) return
    this.onWindowFocus(true)
  }

  /** 正常退出：尽力发送 stop；未发成功时事件已落盘，下次启动补报 */
  private onExit(): void {
    if (!this.enabled || !this.started) return
    const now = Date.now()
    if (now - this.lastStopAt < STOP_DEDUPE_MS) return
    this.lastStopAt = now

    this.state = appendActivityEvent(this.state, 'stop', now)
    this.persist()
    void this.flush()
  }

  private enqueue(type: ActivityEventType): void {
    this.state = appendActivityEvent(this.state, type)
    this.persist()
    this.scheduleFlush(this.state.queue.length >= FLUSH_THRESHOLD ? 0 : FLUSH_DEBOUNCE_MS)
  }

  /** 串行发送队列；网络错误保留队列，4xx 丢弃当前批，429 退避 */
  async flush(): Promise<void> {
    if (!this.enabled || this.flushing || this.state.queue.length === 0) return

    const now = Date.now()
    if (this.retryAt > now) {
      this.scheduleFlush(this.retryAt - now)
      return
    }

    this.flushing = true
    try {
      while (this.state.queue.length > 0 && this.enabled) {
        const batch = takeActivityBatch(this.state.queue)
        try {
          await this.sendBatch(batch)
        } catch (error) {
          if (error instanceof ActivityApiError) {
            if (error.code === APP_UNAVAILABLE_CODE) {
              this.enabled = false
              console.warn('Activity reporting disabled: app unavailable', error.message)
              return
            }
            if (error.status === 429) {
              this.retryAt = Date.now() + 30_000 + Math.floor(Math.random() * 30_000)
              this.scheduleFlush(this.retryAt - Date.now())
              return
            }
            if (error.status >= 400 && error.status < 500) {
              this.warnOnce(error)
              this.dropBatch(batch.length)
              continue
            }
          }

          // 网络错误 / 5xx：保留队列，稍后重试
          this.retryAt = Date.now() + NETWORK_RETRY_MS
          this.scheduleFlush(NETWORK_RETRY_MS)
          return
        }

        this.dropBatch(batch.length)
      }
    } finally {
      this.flushing = false
    }
  }

  private async sendBatch(events: ActivityEvent[]): Promise<void> {
    const platform = detectActivityPlatform(process.platform)
    if (!platform) throw new Error('Unsupported platform')

    const payload = {
      deviceId: this.state.deviceId,
      platform,
      arch: normalizeActivityArch(process.arch),
      clientVersion: app.getVersion().slice(0, 32),
      events
    }
    // 签的 = 发的：签名与发送复用同一字符串
    const body = JSON.stringify(payload)
    const headers = buildActivityHeaders(this.state.deviceId, body, this.secret)

    const response = await net.fetch(`${this.baseUrl}${ACTIVITY_REPORT_PATH}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(ACTIVITY_REQUEST_TIMEOUT_MS)
    })

    let json: unknown = null
    try {
      json = await response.json()
    } catch {
      json = null
    }
    parseActivityResponse(json, response.status)
  }

  private dropBatch(count: number): void {
    this.state = { ...this.state, queue: this.state.queue.slice(count) }
    this.persist()
  }

  private warnOnce(error: ActivityApiError): void {
    if (this.warnedCodes.has(error.code)) return
    this.warnedCodes.add(error.code)
    console.warn('Activity report rejected:', error.code, error.message, error.status)
  }

  /** 保留最早的待刷新时间；已有更早的定时器时不重复设置 */
  private scheduleFlush(delay: number): void {
    const at = Date.now() + Math.max(0, delay)
    if (this.flushTimer && this.flushAt <= at) return
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushAt = at
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null
        this.flushAt = 0
        void this.flush()
      },
      Math.max(0, delay)
    )
    this.flushTimer.unref()
  }

  /** 状态文件很小且写入频率低，同步写入避免退出时丢失 stop */
  private persist(): void {
    const tempPath = `${this.stateFile}.tmp`
    try {
      writeFileSync(tempPath, serializeActivityState(this.state), 'utf8')
      renameSync(tempPath, this.stateFile)
    } catch (error) {
      rmSync(tempPath, { force: true })
      console.warn('Failed to save activity state:', error)
    }
  }
}

/** 在 app ready 之后调用：初始化上报器并补报历史队列 */
export function initActivityReporter(): void {
  if (reporter) return
  const secret = __MARKIT_APPHUB_APP_SECRET__
  reporter = new ActivityReporter(
    join(app.getPath('userData'), STATE_FILE_NAME),
    secret,
    resolveBaseUrl(),
    isReportingEnabled(secret)
  )
  reporter.init()
}

/** 首个编辑窗口对用户可见时调用（每个进程只生效一次） */
export function notifyActivityWindowShown(): void {
  reporter?.onWindowShown()
}
