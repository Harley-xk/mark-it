import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

test('不受信任文档的 HTML 不会执行脚本且生产 CSP 生效', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-security-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-security-user-'))
  const mdPath = join(workDir, 'untrusted.md')
  writeFileSync(
    mdPath,
    [
      '# 安全测试',
      '',
      '<img id="probe" src="x" onerror="window.__markitXss = \'img\'">',
      "<script>window.__markitXss = 'script'</script>",
      '<iframe src="https://example.com"></iframe>',
      '',
      '正常内容仍然可见。',
      ''
    ].join('\n'),
    'utf-8'
  )

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])

  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'untrusted.md' })).toBeVisible()

    const preview = window.locator('.preview-content').first()
    await expect(preview).toContainText('正常内容仍然可见。')

    // 事件属性、脚本与 iframe 都应在进入预览 DOM 前被移除
    await expect(preview.locator('script')).toHaveCount(0)
    await expect(preview.locator('iframe')).toHaveCount(0)
    const onerror = await preview.locator('#probe').getAttribute('onerror')
    expect(onerror).toBeNull()

    // 给事件属性一次触发机会，确认没有脚本执行
    await window.waitForTimeout(500)
    const executed = await window.evaluate(() => {
      return (window as unknown as { __markitXss?: string }).__markitXss
    })
    expect(executed).toBeUndefined()

    // 生产构建的三个入口都应由 Vite 插件注入 CSP
    const csp = await window.evaluate(() => {
      return document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content')
    })
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'self'")
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('生产 CSP 下 Mermaid 图表仍可渲染', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-diagram-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-diagram-user-'))
  const mdPath = join(workDir, 'diagram.md')
  writeFileSync(
    mdPath,
    ['# 图表', '', '```mermaid', 'flowchart TD', '  A[开始] --> B[结束]', '```', ''].join('\n'),
    'utf-8'
  )

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])

  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'diagram.md' })).toBeVisible()
    await expect(window.locator('.preview-content .mermaid-diagram svg').first()).toBeVisible({
      timeout: 20000
    })
    await expect(window.locator('.preview-content .mermaid-error')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('生产 CSP 下 markit-file 本地图片仍可加载', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  // 1x1 透明 PNG，用于验证 markit-file 协议与 img-src 白名单
  const pixelPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-image-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-image-user-'))
  const imagePath = join(workDir, 'pixel.png')
  const mdPath = join(workDir, 'local-image.md')
  writeFileSync(imagePath, Buffer.from(pixelPng, 'base64'))
  writeFileSync(mdPath, '![本地图片](./pixel.png)\n', 'utf-8')

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, mdPath])

  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'local-image.md' })).toBeVisible()

    const image = window.locator('.preview-content img').first()
    await expect(image).toHaveAttribute('src', /^markit-file:\/\/local\//)
    await expect
      .poll(async () => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
