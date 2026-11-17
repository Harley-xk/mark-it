import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

test('最近打开在欢迎态与工具栏展示，清除后重启不再出现', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-recent-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-recent-user-'))
  const mdPath = join(workDir, 'recent.md')
  writeFileSync(mdPath, '# Recent\n', 'utf-8')
  // 预置侧车文件，模拟上一个版本已打开过的记录
  writeFileSync(
    join(userDataDir, 'recent-files.json'),
    JSON.stringify({
      version: 1,
      files: [{ path: mdPath, name: 'recent.md', openedAt: Date.now() }]
    }),
    'utf-8'
  )

  let app = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.welcome-recent')).toBeVisible()
    await expect(window.locator('.welcome-recent .recent-item')).toContainText('recent.md')

    // 从欢迎态浮层打开后应激活对应标签
    await window.locator('.welcome-recent .recent-item').click()
    await expect(window.locator('.tab-name', { hasText: 'recent.md' })).toBeVisible()
    await expect(window.locator('.welcome-recent')).toHaveCount(0)

    // 工具栏下拉列出同一条记录
    await window.locator('.recent-menu-root .tb-btn').click()
    await expect(window.locator('.recent-popover')).toBeVisible()
    await expect(window.locator('.recent-popover .recent-item')).toContainText('recent.md')
    await window.locator('.recent-clear').click()
    await expect(window.locator('.recent-popover .recent-empty')).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.locator('.recent-popover')).toHaveCount(0)

    // 等会话快照包含当前文件，验证「清除记录」不会被会话恢复补齐覆盖
    const sessionPath = join(userDataDir, 'session.json')
    await expect
      .poll(() => (existsSync(sessionPath) ? readFileSync(sessionPath, 'utf-8') : ''), {
        timeout: 5000
      })
      .toContain('recent.md')
  } finally {
    await app.close()
  }

  // 清除后重启：即使会话恢复了同一个文件，最近记录也保持为空
  app = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.app-layout')).toBeVisible()
    await expect(window.locator('.welcome-recent')).toHaveCount(0)
    await window.locator('.recent-menu-root .tb-btn').click()
    await expect(window.locator('.recent-popover .recent-empty')).toBeVisible()
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('会话恢复出的路径会补齐最近列表', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-recent-seed-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-recent-seed-user-'))
  const mdPath = join(workDir, 'restored.md')
  writeFileSync(mdPath, '# Restored\n', 'utf-8')

  let app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'restored.md' })).toBeVisible()
    // 等会话快照落盘后再关闭，确保第二次启动有可恢复的标签
    const sessionPath = join(userDataDir, 'session.json')
    await expect
      .poll(() => (existsSync(sessionPath) ? readFileSync(sessionPath, 'utf-8') : ''), {
        timeout: 5000
      })
      .toContain('restored.md')
  } finally {
    await app.close()
  }

  // 模拟从旧版本升级：只有会话，没有最近列表
  rmSync(join(userDataDir, 'recent-files.json'), { force: true })

  app = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'restored.md' })).toBeVisible()
    await window.locator('.recent-menu-root .tb-btn').click()
    await expect(window.locator('.recent-popover .recent-item')).toContainText('restored.md')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('自动保存按设置间隔把编辑内容写入磁盘', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-autosave-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-autosave-user-'))
  const mdPath = join(workDir, 'auto.md')
  writeFileSync(mdPath, '# Auto\n', 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'auto.md' })).toBeVisible()

    // 设置页把自动保存改为 2 秒
    const settingsOpened = app.waitForEvent('window')
    await window.locator('.tb-btn[title="设置 (Ctrl+,)"]').click()
    const settingsWindow = await settingsOpened
    await settingsWindow.locator('.nav-item', { hasText: '编辑与预览' }).click()
    await settingsWindow.locator('.mode-segment button', { hasText: '2 秒' }).click()
    await settingsWindow.close()

    // 输入后停手，等待自动保存写盘
    await window.locator('.cm-content').click()
    await window.keyboard.press('Control+End')
    await window.keyboard.type('AUTOSAVE_MARKER')
    await expect
      .poll(() => readFileSync(mdPath, 'utf-8'), { timeout: 10_000 })
      .toContain('AUTOSAVE_MARKER')
    await expect(window.locator('.status-warning')).toHaveCount(0)

    // 设置项持久化：重新打开设置页，2 秒仍为选中态
    const reopened = app.waitForEvent('window')
    await window.locator('.tb-btn[title="设置 (Ctrl+,)"]').click()
    const settingsAgain = await reopened
    await settingsAgain.locator('.nav-item', { hasText: '编辑与预览' }).click()
    await expect(
      settingsAgain
        .locator('.setting-card')
        .filter({ hasText: '自动保存' })
        .locator('button.active')
    ).toContainText('2 秒')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
