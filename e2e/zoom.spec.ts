import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
const appEntry = join(projectRoot, 'out/main/index.js')

function getLaunchEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value
  }
  return env
}

/**
 * `webContents.sendInputEvent` 要求窗口已聚焦；完整套件里前一个窗口的焦点
 * 可能还没切过来，因此发送前显式聚焦并留出一帧。
 */
async function sendZoomStep(app: Awaited<ReturnType<typeof electron.launch>>): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return
    win.show()
    win.focus()
    win.webContents.focus()
    await new Promise((resolve) => setTimeout(resolve, 100))
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '=', modifiers: ['control'] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '=', modifiers: ['control'] })
  })
}

test('全局缩放可通过状态栏与设置页调整并同步到所有窗口', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-zoom-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    const first = await app.firstWindow()
    await first.bringToFront()
    await expect(first.locator('.status-bar')).toBeVisible()

    // Chromium 的缩放快捷键由主进程 before-input-event 处理，
    // Playwright 的 keyboard.press 到不了该层，改用 webContents.sendInputEvent 触发。
    await sendZoomStep(app)
    await expect(first.locator('.zoom-trigger')).toHaveText('缩放 110%')

    await sendZoomStep(app)
    await expect(first.locator('.zoom-trigger')).toHaveText('缩放 120%')

    await first.locator('.zoom-trigger').click()
    await expect(first.locator('.zoom-panel')).toBeVisible()
    await first.locator('.zoom-preset', { hasText: '150%' }).click()
    await expect(first.locator('.zoom-trigger')).toHaveText('缩放 150%')
    await first.keyboard.press('Escape')
    await expect(first.locator('.zoom-panel')).toHaveCount(0)

    const secondPromise = app.waitForEvent('window')
    await first.keyboard.press('Control+Shift+n')
    const second = await secondPromise
    await expect(second.locator('.zoom-trigger')).toHaveText('缩放 150%')

    const settingsPromise = app.waitForEvent('window')
    await second.keyboard.press('Control+,')
    const settings = await settingsPromise
    await expect(settings.locator('.zoom-value')).toHaveText('150%')

    await settings.locator('.zoom-preset', { hasText: '120%' }).click()
    await expect(settings.locator('.zoom-value')).toHaveText('120%')
    await expect(first.locator('.zoom-trigger')).toHaveText('缩放 120%')
    await expect(second.locator('.zoom-trigger')).toHaveText('缩放 120%')

    await first.locator('.zoom-trigger').click()
    await first.locator('.zoom-panel .zoom-value').click()
    await expect(settings.locator('.zoom-value')).toHaveText('100%')
    await expect(first.locator('.zoom-trigger')).toHaveCount(0)

    const factors = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((win) => !win.isDestroyed())
        .map((win) => win.webContents.getZoomFactor())
    )
    expect(factors.every((factor) => Math.abs(factor - 1) < 0.001)).toBe(true)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
