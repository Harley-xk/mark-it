import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

const SVG_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#2563eb" />
</svg>
`

test('单击图片在独立窗口中打开大图预览', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-media-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-media-user-'))
  const imagePath = join(workDir, 'big.svg')
  const documentPath = join(workDir, 'media.md')
  writeFileSync(imagePath, SVG_IMAGE, 'utf-8')
  writeFileSync(
    documentPath,
    [
      '# 图片预览',
      '',
      '![测试图](./big.svg)',
      '',
      '[![链接图](./big.svg)](#anchor)',
      '',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      ''
    ].join('\n'),
    'utf-8'
  )

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, documentPath])
  try {
    const window = await app.firstWindow()
    const images = window.locator('.preview-content img')
    await expect(images).toHaveCount(2)
    await expect(images.first()).toBeVisible()

    const previewPromise = app.waitForEvent('window')
    await images.first().click()
    const preview = await previewPromise
    await preview.waitForLoadState('domcontentloaded')

    const previewWindow = preview.locator('.preview-window')
    await expect(previewWindow).toBeVisible()
    await expect(preview.locator('.preview-image')).toBeVisible()
    await expect(preview).toHaveTitle(/图片预览/)

    // 图片不再额外叠加底色，避免在自身有背景的图片外又出现一层色块
    const imageBackground = await preview
      .locator('.preview-image')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(imageBackground).toBe('rgba(0, 0, 0, 0)')

    // 预览窗口内容区铺满窗口，不再覆盖编辑窗口的标题栏与状态栏
    const viewportSize = await preview.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))
    const windowBox = await previewWindow.boundingBox()
    expect(windowBox?.width).toBeCloseTo(viewportSize.width, 0)
    expect(windowBox?.height).toBeCloseTo(viewportSize.height, 0)

    // 按钮缩放以中心为锚点；点击百分比恢复 100%
    const zoomLabel = preview.locator('.preview-zoom-label')
    const initialLabel = ((await zoomLabel.textContent()) ?? '').trim()
    expect(initialLabel).not.toBe('')
    await preview.locator('.preview-btn[title="放大"]').click()
    await expect(zoomLabel).not.toHaveText(initialLabel)
    await zoomLabel.click()
    await expect(zoomLabel).toHaveText('100%')

    // 放大到超过视口后，滚到左上角应能看到图片左上边缘，而不是被居中裁切
    const viewport = preview.locator('.preview-viewport')
    await viewport.evaluate((element) => {
      element.scrollTop = 0
      element.scrollLeft = 0
    })
    const viewportBox = await viewport.boundingBox()
    const zoomedImageBox = await preview.locator('.preview-image').boundingBox()
    expect(zoomedImageBox?.x).toBeGreaterThanOrEqual((viewportBox?.x ?? 0) - 1)
    expect(zoomedImageBox?.y).toBeGreaterThanOrEqual((viewportBox?.y ?? 0) - 1)

    // Esc 只关闭预览窗口，编辑窗口仍然存在；按键会同步触发窗口关闭，忽略关闭后的输入错误
    const closed = preview.waitForEvent('close')
    await preview.keyboard.press('Escape').catch(() => undefined)
    await closed
    await expect(window.locator('.app-layout')).toBeVisible()

    // 链接内的图片仍然执行链接跳转，不打开预览窗口
    await images.nth(1).click()
    await window.waitForTimeout(400)
    expect(app.windows()).toHaveLength(1)

    // 图表双击保留给文本选择，不打开预览；工具栏放大镜仍然打开独立窗口
    const diagram = window.locator('.mermaid-diagram')
    await expect(diagram).toBeVisible({ timeout: 15_000 })
    await diagram.locator('.mermaid-canvas svg').dblclick()
    await window.waitForTimeout(400)
    expect(app.windows()).toHaveLength(1)

    await diagram.hover()
    const diagramPreviewPromise = app.waitForEvent('window')
    await window.locator('.mermaid-icon-btn').click()
    const diagramPreview = await diagramPreviewPromise
    await diagramPreview.waitForLoadState('domcontentloaded')
    await expect(diagramPreview.locator('.preview-window')).toBeVisible()
    await expect(diagramPreview.locator('.preview-image')).toBeVisible()

    // 图表画布与窗口必须共用同一主题底色
    const diagramWindowBackground = await diagramPreview
      .locator('.preview-window')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    const diagramImageBackground = await diagramPreview
      .locator('.preview-image')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(diagramImageBackground).toBe(diagramWindowBackground)

    const diagramClosed = diagramPreview.waitForEvent('close')
    await diagramPreview.keyboard.press('Escape').catch(() => undefined)
    await diagramClosed
    await expect(window.locator('.app-layout')).toBeVisible()
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
