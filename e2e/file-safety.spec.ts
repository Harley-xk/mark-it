import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

test('非 UTF-8 文件以只读打开且保存引导另存为', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-encoding-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-encoding-user-'))
  const mdPath = join(workDir, 'gbk.md')
  // GBK 编码的「中文」，不是合法 UTF-8
  const original = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
  writeFileSync(mdPath, original)

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'gbk.md' })).toBeVisible()
    await expect(window.locator('.status-item', { hasText: '只读' })).toBeVisible()
    await expect(window.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')

    // 先关闭打开时的只读提示，再触发保存
    await expect(window.locator('.confirm-title')).toHaveText('文件打开提示')
    await window.locator('.confirm-dialog .close-btn').click()
    await window.keyboard.press('Control+s')
    await expect(window.locator('.confirm-title')).toHaveText('文件为只读')
    await expect(window.locator('.confirm-body')).toContainText('另存为')
    await window.locator('.confirm-dialog .close-btn').click()

    // 原文件字节必须保持不变
    expect(readFileSync(mdPath).equals(original)).toBe(true)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('外部删除文件后标签显示缺失，保存可重建文件', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-missing-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-missing-user-'))
  const mdPath = join(workDir, 'missing.md')
  writeFileSync(mdPath, '# 原始内容\n', 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'missing.md' })).toBeVisible()

    rmSync(mdPath, { force: true })
    // 文件监听轮询发现删除后应自动显示缺失，无需手动刷新
    await expect(window.locator('.tab-missing')).toBeVisible({ timeout: 3000 })

    await window.keyboard.press('F5')
    await expect(window.locator('.confirm-title')).toHaveText('部分文件未能打开')
    await expect(window.locator('.confirm-body')).toContainText('不存在')
    await window.locator('.confirm-dialog .close-btn').click()

    await window.keyboard.press('Control+s')
    await expect.poll(() => existsSync(mdPath)).toBe(true)
    await expect(window.locator('.tab-missing')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('渲染进程无法读写未经用户选择的路径', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-guard-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-guard-user-'))
  const outsidePath = join(workDir, 'outside.md')
  const targetPath = join(workDir, 'forged.md')
  writeFileSync(outsidePath, '# 不应被读取\n', 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const window = await app.firstWindow()

    const readResult = await window.evaluate((path) => window.api.readFile(path), outsidePath)
    expect(readResult.ok).toBe(false)
    if (!readResult.ok) expect(readResult.error.code).toBe('not-trusted')

    const saveResult = await window.evaluate(
      (path) => window.api.saveFile(path, 'forged content'),
      targetPath
    )
    expect(saveResult.ok).toBe(false)
    if (!saveResult.ok) expect(saveResult.error.code).toBe('not-trusted')
    expect(existsSync(targetPath)).toBe(false)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('渲染进程错误上报写入诊断日志', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-log-'))
  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`])
  try {
    const actualUserData = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath('userData')
    )
    const logFile = join(actualUserData, 'logs', 'main.log')
    const window = await app.firstWindow()
    await window.evaluate(() => {
      window.api.reportRendererError({
        kind: 'error',
        message: 'diag-e2e-marker',
        source: undefined,
        stack: undefined
      })
    })
    await window.waitForTimeout(500)
    const logContent = existsSync(logFile) ? readFileSync(logFile, 'utf-8') : '(missing log file)'
    expect(logContent).toContain('[renderer:error] diag-e2e-marker')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
