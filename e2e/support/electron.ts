import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { join } from 'path'

export const projectRoot = join(__dirname, '../..')
export const appEntry = join(projectRoot, 'out/main/index.js')

/** E2E_VISIBLE=1 时恢复可见窗口，便于肉眼排查窗口相关用例 */
function isQuietMode(): boolean {
  return process.env.E2E_VISIBLE !== '1'
}

/** 去掉 IDE / 终端注入的 ELECTRON_RUN_AS_NODE，否则 Electron 会退化为纯 Node */
export function getLaunchEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value
  }
  return env
}

/**
 * 静默模式：窗口完全透明、不进入任务栏且不可被激活，但页面照常渲染。
 * 可见性断言基于 DOM 与布局，不受窗口 alpha 影响；同时覆盖已创建与后续新建的窗口。
 */
async function hideWindows(app: ElectronApplication, focusable: boolean): Promise<void> {
  await app.evaluate(({ app: electronApp, BrowserWindow }, allowFocus) => {
    const applyQuiet = (win: InstanceType<typeof BrowserWindow>): void => {
      if (win.isDestroyed()) return
      win.setOpacity(0)
      win.setSkipTaskbar(true)
      if (!allowFocus) win.setFocusable(false)
    }

    BrowserWindow.getAllWindows().forEach(applyQuiet)
    electronApp.on('browser-window-created', (_event, win) => applyQuiet(win))
  }, focusable)
}

export interface LaunchAppOptions {
  cwd?: string
  /**
   * 静默模式下是否允许窗口获得系统焦点，默认 false。
   * 仅依赖真实焦点（如 getFocusedWindow、webContents.sendInputEvent）的用例需要开启。
   */
  focusable?: boolean
}

export async function launchApp(
  args: string[],
  options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
  const app = await electron.launch({
    args,
    cwd: options.cwd ?? projectRoot,
    env: getLaunchEnv()
  })
  if (isQuietMode()) await hideWindows(app, options.focusable === true)
  return app
}
