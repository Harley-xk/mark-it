import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

test('界面语言可切换为英文，同步到所有窗口并在重启后保持', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-i18n-'))
  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`])

  try {
    const mainWindow = await app.firstWindow()
    await expect(mainWindow.locator('.app-layout')).toBeVisible()
    await expect(mainWindow.locator('.tb-btn[title="设置 (Ctrl+,)"]')).toHaveCount(1)

    const settingsOpened = app.waitForEvent('window')
    await mainWindow.locator('.tb-btn[title="设置 (Ctrl+,)"]').click()
    const settingsWindow = await settingsOpened
    await expect(settingsWindow).toHaveTitle('MarkIt 设置')

    // 外观页的语言下拉切换到 English
    await settingsWindow.locator('.language-trigger').click()
    await expect(settingsWindow.locator('.language-option')).toHaveCount(3)
    await settingsWindow.locator('.language-option', { hasText: 'English' }).click()
    await expect(settingsWindow.locator('.language-menu')).toHaveCount(0)

    await expect(settingsWindow).toHaveTitle('MarkIt Settings')
    await expect(settingsWindow.locator('.nav-item', { hasText: 'Appearance' })).toBeVisible()
    await expect(settingsWindow.locator('.panel')).toContainText('Interface Language')
    await expect(mainWindow.locator('.tb-btn[title="设置 (Ctrl+,)"]')).toHaveCount(0)
    await expect(mainWindow.locator('.tb-btn[title="Settings (Ctrl+,)"]')).toHaveCount(1)

    // 英文文案不应撑破设置窗口与状态栏
    await settingsWindow.setViewportSize({ width: 720, height: 560 })
    await expect
      .poll(() => settingsWindow.evaluate(() => document.body.scrollWidth <= window.innerWidth))
      .toBe(true)
    await expect
      .poll(() =>
        settingsWindow
          .locator('.language-trigger')
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      )
      .toBe(true)
    await mainWindow.setViewportSize({ width: 900, height: 600 })
    await expect
      .poll(() =>
        mainWindow.evaluate(() => {
          const bar = document.querySelector('.status-bar')
          return !!bar && bar.scrollWidth <= bar.clientWidth + 1
        })
      )
      .toBe(true)

    // 英文手册按当前语言打开
    await mainWindow.locator('.tb-btn[title="User Manual"]').click()
    await expect(mainWindow.locator('.tab-name', { hasText: 'User Manual.md' })).toBeVisible()
    await expect(
      mainWindow.locator('.markit-preview-layer:not([aria-hidden]) .preview-content')
    ).toContainText('MarkIt User Manual')

    await settingsWindow.close()
  } finally {
    await app.close()
  }

  const restored = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const window = await restored.firstWindow()
    await expect(window.locator('.tb-btn[title="Settings (Ctrl+,)"]')).toHaveCount(1)
    await expect(
      window.locator('.status-item', { hasText: 'Editor left, preview right' })
    ).toBeVisible()
  } finally {
    await restored.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
