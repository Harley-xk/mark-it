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

test('独立设置窗口可打开、复用并同步全局主题', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-settings-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const mainWindow = await app.firstWindow()
    await expect(mainWindow.locator('.app-layout')).toBeVisible()

    const settingsOpened = app.waitForEvent('window')
    await mainWindow.locator('.tb-btn[title="设置 (Ctrl+,)"]').click()
    const settingsWindow = await settingsOpened
    const consoleErrors: string[] = []
    settingsWindow.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await expect(settingsWindow).toHaveTitle('MarkIt 设置')
    await expect(settingsWindow.locator('.settings-window')).toBeVisible()
    await expect(settingsWindow.locator('.window-titlebar')).toBeVisible()
    await expect(settingsWindow.locator('.dialog-close')).toHaveCount(0)
    await expect(settingsWindow.locator('.nav-item.active')).toContainText('外观')

    await settingsWindow.locator('.theme-card', { hasText: '深色' }).click()
    await expect(settingsWindow.locator('.settings-window')).not.toHaveClass(/light/)
    await expect(mainWindow.locator('.app-layout')).not.toHaveClass(/light/)

    await settingsWindow.locator('.theme-card', { hasText: '浅色' }).click()
    await expect(settingsWindow.locator('.settings-window')).toHaveClass(/light/)
    await expect(mainWindow.locator('.app-layout')).toHaveClass(/light/)

    await settingsWindow.locator('.nav-item', { hasText: '编辑与预览' }).click()
    await expect(settingsWindow.locator('.panel')).toContainText('预览样式')
    await expect(settingsWindow.locator('.style-row.selected')).toContainText('GitHub')

    await settingsWindow.locator('.search-box input').fill('Beta')
    await expect(settingsWindow.locator('.search-result')).toContainText('接收 Beta 版更新')
    await settingsWindow.locator('.search-result').click()
    await expect(settingsWindow.locator('.panel')).toContainText('更新通道')

    await settingsWindow.locator('.nav-item', { hasText: '编辑器集成' }).click()
    await expect(settingsWindow.locator('.panel')).toContainText('VS Code')
    await settingsWindow.locator('.nav-item', { hasText: '关于' }).click()
    await expect(settingsWindow.locator('.panel')).toContainText('MarkIt')
    expect(consoleErrors).toEqual([])

    await mainWindow.keyboard.press('Control+,')
    await expect.poll(() => app.windows().length).toBe(2)
    await expect(settingsWindow.locator('.settings-window')).toBeVisible()

    await settingsWindow.setViewportSize({ width: 720, height: 560 })
    await expect(settingsWindow.locator('.nav')).toBeVisible()
    await expect
      .poll(() => settingsWindow.evaluate(() => document.body.scrollWidth <= window.innerWidth))
      .toBe(true)

    await settingsWindow.close()
    await expect.poll(() => app.windows().length).toBe(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
