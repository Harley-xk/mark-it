import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

/** 生成指定大小的 Markdown：每段约 100 字节，便于稳定跨过阈值 */
function markdownOfSize(bytes: number): string {
  const line = '大文件测试段落 Large file paragraph with some English text 0123456789.\n'
  const body = line.repeat(Math.ceil(bytes / Buffer.byteLength(line, 'utf-8')) + 16)
  return `# 大文件测试\n\n${body}`
}

test('大文件默认暂停预览，可显式渲染', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-large-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-large-user-'))
  const mdPath = join(workDir, 'large-2m.md')
  writeFileSync(mdPath, markdownOfSize(2 * 1024 * 1024), 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'large-2m.md' })).toBeVisible()

    // 大文件仍可编辑：内容不受大小影响
    await expect(window.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
    await expect(window.locator('.status-mode')).toHaveText('大文件')
    await expect(window.locator('.preview-paused-badge')).toHaveText('大文件模式')
    await expect(window.locator('.preview-paused')).toContainText('预览已暂停')

    await window.locator('.preview-paused-action').click()
    await expect(window.locator('.confirm-title')).toHaveText('渲染大文件预览')
    await window.locator('.confirm-actions .btn-primary').click()

    await expect(window.locator('.preview-paused')).toHaveCount(0)
    await expect(window.locator('.preview-content')).toContainText('大文件测试')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('纯文本模式可编辑并保存，不因大小失去写权限', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-plain-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-plain-user-'))
  const mdPath = join(workDir, 'plain-6m.md')
  writeFileSync(mdPath, markdownOfSize(6 * 1024 * 1024), 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'plain-6m.md' })).toBeVisible()

    // 超过 5 MiB 会给出打开提示，先关闭
    await expect(window.locator('.confirm-title')).toHaveText('文件打开提示')
    await window.locator('.confirm-dialog .close-btn').click()

    await expect(window.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
    await expect(window.locator('.status-mode')).toHaveText('纯文本')
    await expect(window.locator('.status-mode-action')).toHaveText('恢复 Markdown')
    await expect(window.locator('.preview-paused-badge')).toHaveText('纯文本模式')

    await window.locator('.cm-line').first().click()
    await window.keyboard.press('Control+Home')
    await window.keyboard.type('PLAIN_MODE_EDIT ')
    await window.keyboard.press('Control+s')
    await expect
      .poll(() => readFileSync(mdPath, 'utf-8').includes('PLAIN_MODE_EDIT'), { timeout: 5000 })
      .toBe(true)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
