/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 主进程滚动日志、崩溃捕获、渲染错误上报与诊断日志导出
 */
import { app, BrowserWindow, dialog } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { RendererErrorReport } from '../shared/diagnostics-types'
import { mt } from './i18n'

const LOG_DIR_NAME = 'logs'
const LOG_FILE_NAME = 'main.log'
/** 单个日志文件上限；超过后滚动，避免长期运行无限增长 */
const MAX_LOG_BYTES = 2 * 1024 * 1024
/** 除当前文件外保留的归档数量 */
const MAX_ARCHIVES = 2
const MAX_FIELD_CHARS = 16_384

let installed = false
let directoryReady = false
let writing = false
const handledRendererCrashes = new Set<number>()

function logDirectory(): string {
  return join(app.getPath('userData'), LOG_DIR_NAME)
}

export function logFilePath(): string {
  return join(logDirectory(), LOG_FILE_NAME)
}

function archivePath(index: number): string {
  return join(logDirectory(), `${LOG_FILE_NAME}.${index}`)
}

function ensureLogDirectory(): void {
  if (directoryReady) return
  mkdirSync(logDirectory(), { recursive: true })
  directoryReady = true
}

function rotateIfNeeded(): void {
  const current = logFilePath()
  if (!existsSync(current) || statSync(current).size < MAX_LOG_BYTES) return
  const oldest = archivePath(MAX_ARCHIVES)
  if (existsSync(oldest)) rmSync(oldest, { force: true })
  for (let index = MAX_ARCHIVES - 1; index >= 1; index -= 1) {
    const source = archivePath(index)
    if (existsSync(source)) renameSync(source, archivePath(index + 1))
  }
  renameSync(current, archivePath(1))
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 追加一条日志；写日志失败时静默降级，绝不影响业务 */
export function appendLog(
  level: 'WARN' | 'ERROR' | 'INFO',
  message: string,
  error?: unknown
): void {
  if (writing) return
  writing = true
  try {
    ensureLogDirectory()
    rotateIfNeeded()
    const lines = [`[${new Date().toISOString()}] [${level}] ${message}`]
    if (error !== undefined) lines.push(describeUnknown(error))
    appendFileSync(logFilePath(), `${lines.join('\n')}\n`, 'utf-8')
  } catch {
    // 日志不可写不应影响主流程
  } finally {
    writing = false
  }
}

/** 截断跨进程传入的字段，避免异常内容撑爆日志 */
function bounded(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value.length > MAX_FIELD_CHARS ? value.slice(0, MAX_FIELD_CHARS) : value
}

export function reportRendererError(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const report = payload as Partial<RendererErrorReport>
  if (report.kind !== 'error' && report.kind !== 'unhandledrejection') return
  const message = bounded(report.message) || '(empty message)'
  const detail = bounded(report.stack) || bounded(report.source)
  appendLog('ERROR', `[renderer:${report.kind}] ${message}`, detail)
}

/** 安装日志、控制台捕获与崩溃处理器；重复调用无副作用 */
export function installLogger(): void {
  if (installed) return
  installed = true

  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)
  console.error = (...args: unknown[]): void => {
    originalError(...args)
    const error = args.find((item) => item instanceof Error)
    const message = args
      .map((item) => (item instanceof Error ? item.message : describeUnknown(item)))
      .join(' ')
    appendLog('ERROR', message, error)
  }
  console.warn = (...args: unknown[]): void => {
    originalWarn(...args)
    const error = args.find((item) => item instanceof Error)
    const message = args
      .map((item) => (item instanceof Error ? item.message : describeUnknown(item)))
      .join(' ')
    appendLog('WARN', message, error)
  }

  process.on('uncaughtException', (error) => {
    appendLog('ERROR', 'Uncaught exception', error)
    try {
      dialog.showErrorBox(
        mt('main.logger.crashTitle'),
        mt('main.logger.crashMessage', {
          message: error.message,
          path: logFilePath()
        })
      )
    } catch {
      // 忽略对话框自身失败
    }
    app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    appendLog('ERROR', 'Unhandled rejection', reason)
  })

  app.on('render-process-gone', (_event, contents, details) => {
    appendLog(
      'ERROR',
      `Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`
    )
    if (details.reason === 'clean-exit' || handledRendererCrashes.has(contents.id)) return
    // 隐藏任务窗口（PDF / 长图导出）崩溃只记录日志，不弹出用户可见的对话框
    const crashedWindow = BrowserWindow.fromWebContents(contents)
    if (!crashedWindow || crashedWindow.isDestroyed() || !crashedWindow.isVisible()) return
    handledRendererCrashes.add(contents.id)
    void dialog
      .showMessageBox({
        type: 'error',
        title: mt('main.logger.rendererCrashTitle'),
        message: mt('main.logger.rendererCrashMessage'),
        detail: mt('main.logger.rendererCrashDetail'),
        buttons: [mt('main.logger.reload'), mt('main.logger.closeWindow')],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        handledRendererCrashes.delete(contents.id)
        if (response === 0) {
          if (!contents.isDestroyed()) contents.reload()
          return
        }
        const win = BrowserWindow.fromWebContents(contents)
        if (win && !win.isDestroyed()) win.destroy()
      })
      .catch(() => undefined)
  })

  app.on('child-process-gone', (_event, details) => {
    appendLog(
      'ERROR',
      `Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`
    )
  })
}

function readLogFile(path: string): string {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8')
  } catch (error) {
    return mt('main.logger.readLogFailed', { error: describeUnknown(error) })
  }
}

function buildDiagnosticsContent(): string {
  const header = [
    mt('main.logger.diagnosticsTitle'),
    mt('main.logger.generatedAt', { time: new Date().toISOString() }),
    mt('main.logger.appVersion', { version: app.getVersion() }),
    mt('main.logger.packaged', {
      value: app.isPackaged ? mt('main.logger.packagedYes') : mt('main.logger.packagedNo')
    }),
    mt('main.logger.platform', { platform: `${process.platform} ${process.arch}` }),
    `Electron: ${process.versions.electron}`,
    `Chromium: ${process.versions.chrome}`,
    `Node: ${process.versions.node}`,
    `userData: ${app.getPath('userData')}`,
    '',
    mt('main.logger.notice'),
    ''
  ].join('\n')

  const sections = [header]
  for (let index = 0; index <= MAX_ARCHIVES; index += 1) {
    const path = index === 0 ? logFilePath() : archivePath(index)
    const content = readLogFile(path)
    if (!content) continue
    sections.push(`===== ${index === 0 ? LOG_FILE_NAME : `${LOG_FILE_NAME}.${index}`} =====`)
    sections.push(content)
  }
  return sections.join('\n')
}

/** 弹出保存对话框并导出诊断日志；用户取消返回 null */
export async function exportDiagnostics(parent: BrowserWindow | null): Promise<string | null> {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('')
  const options = {
    defaultPath: join(app.getPath('documents'), `markit-diagnostics-${stamp}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }]
  }
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null

  try {
    await writeFile(result.filePath, buildDiagnosticsContent(), 'utf-8')
    return result.filePath
  } catch (error) {
    appendLog('ERROR', 'Failed to export diagnostics', error)
    throw error
  }
}
