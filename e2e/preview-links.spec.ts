import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

test('Ctrl + 单击本地 Markdown 链接以后台标签打开目标文档', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-link-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-link-user-'))
  const sourcePath = join(workDir, 'source.md')
  const targetPath = join(workDir, 'target.md')
  writeFileSync(sourcePath, '# 源文档\n\n[目标文档](./target.md)\n', 'utf-8')
  writeFileSync(targetPath, '# 目标文档\n\n目标正文\n', 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, sourcePath])
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab', { hasText: 'source.md' })).toBeVisible()
    await expect(window.locator('.tab')).toHaveCount(1)

    // Ctrl + 单击本地 Markdown 链接：读取目标文件并入列，当前标签保持不变
    const link = window.locator('.preview-content a', { hasText: '目标文档' })
    await expect(link).toBeVisible()

    await link.click({ modifiers: ['Control'] })
    await expect(window.locator('.tab')).toHaveCount(2)
    await expect(window.locator('.tab.active')).toContainText('source.md')

    // 切换到新的后台标签后才展示目标正文
    await window.locator('.tab', { hasText: 'target.md' }).click()
    await expect(window.locator('.tab.active')).toContainText('target.md')
    await expect(
      window.locator('.markit-preview-layer:not([aria-hidden]) .preview-content')
    ).toContainText('目标正文')

    // 目标已打开时再次 Ctrl + 单击：不重复创建，也不切换当前标签
    await window.locator('.tab', { hasText: 'source.md' }).click()
    await window.locator('.preview-content a', { hasText: '目标文档' }).click({
      modifiers: ['Control']
    })
    await expect(window.locator('.tab')).toHaveCount(2)
    await expect(window.locator('.tab.active')).toContainText('source.md')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
