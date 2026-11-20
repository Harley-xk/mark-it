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

test('链接中的 GitHub 风格标题锚点在目标标签激活后定位', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-anchor-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-anchor-user-'))
  const sourcePath = join(workDir, 'source.md')
  const targetPath = join(workDir, 'anchored.md')
  writeFileSync(sourcePath, '# 源文档\n\n[第二节](./anchored.md#第二节)\n', 'utf-8')
  // 标题前后的内容都足够长：锚点才能精确滚到可视区顶部，不会被文档底部夹紧
  const before = Array.from({ length: 60 }, (_, index) => `前文 ${index + 1}`).join('\n\n')
  const after = Array.from({ length: 60 }, (_, index) => `后文 ${index + 1}`).join('\n\n')
  writeFileSync(targetPath, `# 第一节\n\n${before}\n\n## 第二节\n\n${after}\n`, 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, sourcePath])
  try {
    const window = await app.firstWindow()
    await window.locator('.preview-content a', { hasText: '第二节' }).click({
      modifiers: ['Control']
    })
    await expect(window.locator('.tab', { hasText: 'anchored.md' })).toBeVisible()
    await window.locator('.tab', { hasText: 'anchored.md' }).click()

    const container = window.locator('.preview-container')
    await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    // 标题应滚动到预览区顶部附近，而不是仅滚动了任意距离
    const headingTop = await window
      .locator('.markit-preview-layer:not([aria-hidden]) .preview-content #heading-1')
      .evaluate((el) => el.getBoundingClientRect().top)
    const containerTop = await container.evaluate((el) => el.getBoundingClientRect().top)
    expect(Math.abs(headingTop - containerTop)).toBeLessThan(80)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('链接中的行号在目标标签激活后定位到编辑区对应行', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-line-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-line-user-'))
  const sourcePath = join(workDir, 'source.md')
  const targetPath = join(workDir, 'lines.md')
  writeFileSync(sourcePath, '# 源文档\n\n[第六十行](./lines.md:60)\n', 'utf-8')
  const body = Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 行`).join('\n')
  writeFileSync(targetPath, `${body}\n`, 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, sourcePath])
  try {
    const window = await app.firstWindow()
    await window.locator('.preview-content a', { hasText: '第六十行' }).click({
      modifiers: ['Control']
    })
    await expect(window.locator('.tab', { hasText: 'lines.md' })).toBeVisible()
    await window.locator('.tab', { hasText: 'lines.md' }).click()

    // 编辑区滚动到目标行；新标签默认从顶部开始，scrollTop > 0 说明行号跳转生效
    await expect
      .poll(() => window.locator('.cm-scroller').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)
    await expect(window.locator('.cm-activeLine')).toContainText('第 60 行')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
