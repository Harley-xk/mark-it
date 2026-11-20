import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appEntry, launchApp } from './support/electron'

const SVG_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#2563eb" />
</svg>
`

test('单击图片打开覆盖整个窗口的大图预览', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-media-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-media-user-'))
  const imagePath = join(workDir, 'big.svg')
  const documentPath = join(workDir, 'media.md')
  writeFileSync(imagePath, SVG_IMAGE, 'utf-8')
  writeFileSync(
    documentPath,
    '# 图片预览\n\n![测试图](./big.svg)\n\n[![链接图](./big.svg)](#anchor)\n',
    'utf-8'
  )

  const app = await launchApp(['.', `--user-data-dir=${userDataDir}`, documentPath])
  try {
    const window = await app.firstWindow()
    const images = window.locator('.preview-content img')
    await expect(images).toHaveCount(2)
    await expect(images.first()).toBeVisible()

    await images.first().click()
    const modal = window.locator('.media-preview')
    await expect(modal).toBeVisible()
    await expect(window.locator('.media-preview-image')).toBeVisible()

    // 预览覆盖整个应用窗口
    const viewportSize = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))
    const modalBox = await modal.boundingBox()
    expect(modalBox?.width).toBeCloseTo(viewportSize.width, 0)
    expect(modalBox?.height).toBeCloseTo(viewportSize.height, 0)

    // 按钮缩放以中心为锚点；点击百分比恢复 100%
    const zoomLabel = window.locator('.mp-zoom-label')
    const initialLabel = ((await zoomLabel.textContent()) ?? '').trim()
    expect(initialLabel).not.toBe('')
    await window.locator('.mp-btn[title="放大"]').click()
    await expect(zoomLabel).not.toHaveText(initialLabel)
    await zoomLabel.click()
    await expect(zoomLabel).toHaveText('100%')

    await window.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)

    // 链接内的图片仍然执行链接跳转，不打开预览
    await images.nth(1).click()
    await expect(modal).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
