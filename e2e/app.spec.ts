import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
const appEntry = join(projectRoot, 'out/main/index.js')

/** 去掉 IDE / 终端注入的 ELECTRON_RUN_AS_NODE，否则 Electron 会退化为纯 Node */
function getLaunchEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value
  }
  return env
}

test('启动应用并显示主窗口', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  // 独立 userData：避免与用户正在运行的 MarkIt 抢单实例锁，也不污染真实会话
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle(/MarkIt/)
    await expect(window.locator('.app-layout')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('布局模式按标签独立保存并在重启后恢复', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-layout-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-layout-user-'))
  const firstPath = join(workDir, 'layout-first.md')
  const secondPath = join(workDir, 'layout-second.md')
  writeFileSync(firstPath, '# 第一个文档\n', 'utf-8')
  writeFileSync(secondPath, '# 第二个文档\n', 'utf-8')

  const launchOptions = {
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  }

  const app = await electron.launch(launchOptions)
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'layout-first.md' })).toBeVisible()
    await expect(window.locator('.tab-name', { hasText: 'layout-second.md' })).toBeVisible()

    // 第二个标签切到仅预览
    await window.locator('.tab-name', { hasText: 'layout-second.md' }).click()
    await window.locator('.tb-btn[title="仅预览"]').click()
    await expect(window.locator('.tb-btn[title="仅预览"]')).toHaveClass(/active/)
    await expect(window.locator('.editor-pane')).toHaveCount(0)

    // 第一个标签保持自己的默认双栏，并改为仅编辑
    await window.locator('.tab-name', { hasText: 'layout-first.md' }).click()
    await expect(window.locator('.tb-btn[title="左编辑 右预览"]')).toHaveClass(/active/)
    await window.locator('.tb-btn[title="仅编辑"]').click()
    await expect(window.locator('.tb-btn[title="仅编辑"]')).toHaveClass(/active/)
    await expect(window.locator('.preview-container')).toHaveCount(0)

    // 切回第二个标签，布局跟随标签而不是沿用上一个标签
    await window.locator('.tab-name', { hasText: 'layout-second.md' }).click()
    await expect(window.locator('.tb-btn[title="仅预览"]')).toHaveClass(/active/)
    await expect(window.locator('.editor-pane')).toHaveCount(0)

    // 等待会话防抖写入后再关闭，验证跨重启恢复
    await window.waitForTimeout(1200)
  } finally {
    await app.close()
  }

  const restored = await electron.launch(launchOptions)
  try {
    const window = await restored.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'layout-second.md' })).toBeVisible()

    // 激活标签为第二个，应恢复仅预览
    await expect(window.locator('.tb-btn[title="仅预览"]')).toHaveClass(/active/)
    await expect(window.locator('.editor-pane')).toHaveCount(0)

    await window.locator('.tab-name', { hasText: 'layout-first.md' }).click()
    await expect(window.locator('.tb-btn[title="仅编辑"]')).toHaveClass(/active/)
    await expect(window.locator('.preview-container')).toHaveCount(0)
  } finally {
    await restored.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('重启后恢复编辑区与预览区的滚动位置', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-scroll-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-scroll-user-'))
  const mdPath = join(workDir, 'scroll-restore.md')
  writeFileSync(
    mdPath,
    Array.from(
      { length: 200 },
      (_, index) => `## 标题 ${index}\n\n第 ${index} 段正文，用于撑高编辑区与预览区。\n`
    ).join('\n'),
    'utf-8'
  )

  const launchOptions = {
    args: ['.', `--user-data-dir=${userDataDir}`, mdPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  }

  let before = { editor: 0, preview: 0 }
  const app = await electron.launch(launchOptions)
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'scroll-restore.md' })).toBeVisible()

    const scroller = window.locator('.cm-scroller')
    await expect(scroller).toBeVisible()

    // 预览挂载时要等 Mermaid 渲染链结束才恢复滚动位置，等它稳定后再操作，
    // 否则程序化滚动会被随后的挂载恢复覆盖
    await window.waitForTimeout(3000)

    // 先点击正文建立光标（触发会话防抖写入），再分别滚动编辑区与预览区
    await window.locator('.cm-content').click({ position: { x: 40, y: 40 } })
    await scroller.evaluate((el) => {
      el.scrollTop = 1600
    })
    await window.locator('.preview-container').evaluate((el) => {
      el.scrollTop = 900
    })
    // 两个滚动容器会互相联动，等联动结束再读取最终位置
    await window.waitForTimeout(300)

    before = await window.evaluate(() => ({
      editor: document.querySelector('.cm-scroller')?.scrollTop ?? 0,
      preview: document.querySelector('.preview-container')?.scrollTop ?? 0
    }))
    expect(before.editor).toBeGreaterThan(500)
    expect(before.preview).toBeGreaterThan(200)

    // 等待 800ms 防抖把会话（含滚动位置）写入磁盘
    await window.waitForTimeout(1200)
  } finally {
    await app.close()
  }

  const restored = await electron.launch(launchOptions)
  try {
    const window = await restored.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'scroll-restore.md' })).toBeVisible()
    await expect(window.locator('.cm-scroller')).toBeVisible()

    const readScroll = (): Promise<{ editor: number; preview: number }> =>
      window.evaluate(() => ({
        editor: document.querySelector('.cm-scroller')?.scrollTop ?? 0,
        preview: document.querySelector('.preview-container')?.scrollTop ?? 0
      }))

    // 会话恢复与预览的 Mermaid 渲染链都是异步的，轮询到两个位置都恢复为止
    await expect
      .poll(async () => (await readScroll()).editor, { timeout: 15_000 })
      .toBeGreaterThan(before.editor - 60)
    await expect
      .poll(async () => (await readScroll()).preview, { timeout: 15_000 })
      .toBeGreaterThan(before.preview - 80)

    await window.waitForTimeout(300)
    const after = await readScroll()
    // 编辑区按文档锚点恢复，允许一行左右的误差；预览区按像素恢复
    expect(Math.abs(after.editor - before.editor)).toBeLessThan(60)
    expect(Math.abs(after.preview - before.preview)).toBeLessThan(80)
  } finally {
    await restored.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('长文档来回切标签时滚动位置不累积偏移', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-tabscroll-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-tabscroll-user-'))
  const longPath = join(workDir, 'scroll-long.md')
  const shortPath = join(workDir, 'scroll-short.md')
  // Mermaid 放在文档前部：切换标签后它会异步重渲染并改变上方高度，
  // 正是"按像素恢复 + 双向联动"逐次放大的来源
  const sections = Array.from(
    { length: 400 },
    (_, index) => `## 小节 ${index}\n\n第 ${index} 段正文，用于撑高编辑区与预览区。\n`
  ).join('\n')
  writeFileSync(
    longPath,
    `# 长文档\n\n\`\`\`mermaid\ngraph TD\n  A[开始] --> B[结束]\n\`\`\`\n\n${sections}`,
    'utf-8'
  )
  writeFileSync(shortPath, '# 短文档\n\n简短内容。\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, longPath, shortPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    const window = await app.firstWindow()
    const longTab = window.locator('.tab-name', { hasText: 'scroll-long.md' })
    const shortTab = window.locator('.tab-name', { hasText: 'scroll-short.md' })
    await expect(longTab).toBeVisible()
    await expect(shortTab).toBeVisible()
    await window.waitForTimeout(2500)

    // 布局按标签保存：两个标签统一为分栏，避免切换标签时面板重建干扰滚动恢复
    const splitButton = window.locator('.tb-btn[title="左编辑 右预览"]')
    await longTab.click()
    await window.waitForTimeout(1500)
    await splitButton.click()
    await window.waitForTimeout(600)
    await shortTab.click()
    await window.waitForTimeout(600)
    await splitButton.click()
    await window.waitForTimeout(600)
    await longTab.click()
    await expect(window.locator('.preview-content .mermaid-diagram')).toHaveCount(1, {
      timeout: 15_000
    })

    const readScroll = (): Promise<{ editor: number; preview: number }> =>
      window.evaluate(() => ({
        editor: document.querySelector('.cm-scroller')?.scrollTop ?? 0,
        preview: document.querySelector('.preview-container')?.scrollTop ?? 0
      }))

    // 滚到文档中段后，先来回切一次取得稳定后的基准位置
    await window.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 8000
    })
    await window.waitForTimeout(500)
    await shortTab.click()
    await window.waitForTimeout(400)
    await longTab.click()
    await expect(window.locator('.preview-content .mermaid-diagram')).toHaveCount(1, {
      timeout: 15_000
    })
    await window.waitForTimeout(1000)
    const baseline = await readScroll()
    expect(baseline.editor).toBeGreaterThan(1000)
    expect(baseline.preview).toBeGreaterThan(1000)

    // 之后每次切回都必须落在同一位置，不允许逐次累积偏移
    for (let round = 0; round < 3; round++) {
      await shortTab.click()
      await window.waitForTimeout(400)
      await longTab.click()
      await expect(window.locator('.preview-content .mermaid-diagram')).toHaveCount(1, {
        timeout: 15_000
      })
      await window.waitForTimeout(1000)
      const current = await readScroll()
      expect(Math.abs(current.editor - baseline.editor)).toBeLessThan(5)
      expect(Math.abs(current.preview - baseline.preview)).toBeLessThan(5)
    }
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('导出 PDF 并生成有效产物', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-pdf-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-'))
  const mdPath = join(workDir, 'pdf-smoke.md')
  const pdfPath = join(workDir, 'pdf-smoke.pdf')
  writeFileSync(
    mdPath,
    [
      '# PDF 冒烟',
      '',
      '| 列 A | 列 B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '```mermaid',
      'not a valid diagram',
      '```',
      '',
      ...Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 段正文。`),
      ''
    ].join('\n'),
    'utf-8'
  )

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, mdPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'pdf-smoke.md' })).toBeVisible()

    // 替换系统保存对话框，避免原生弹窗阻塞自动化；
    // 同时记录主进程收到的 defaultPath，用于校验默认文件名
    await app.evaluate(({ dialog }, filePath) => {
      const state = globalThis as { __pdfDefaultPath?: string }
      state.__pdfDefaultPath = ''
      const stub = async (...args: unknown[]): Promise<{ canceled: boolean; filePath: string }> => {
        const options = args[args.length - 1] as { defaultPath?: string } | undefined
        state.__pdfDefaultPath = options?.defaultPath ?? ''
        return { canceled: false, filePath }
      }
      dialog.showSaveDialog = stub as typeof dialog.showSaveDialog
    }, pdfPath)

    const shortcut = process.platform === 'darwin' ? 'Meta+p' : 'Control+p'
    await window.keyboard.press(shortcut)
    const exportButton = window.locator('.dialog .btn-primary')
    await expect(exportButton).toBeVisible()
    await exportButton.click()

    // 确认导出后选项对话框立即关闭，进度改由状态栏展示
    await expect(window.locator('.dialog')).toHaveCount(0)
    await expect(window.locator('.status-export')).toBeVisible()

    await expect
      .poll(
        () => {
          try {
            return statSync(pdfPath).size
          } catch {
            return 0
          }
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0)
    expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe('%PDF-')

    // 默认文件名取当前文档名，并定位到文档所在目录
    const defaultPath = await app.evaluate(
      () => (globalThis as { __pdfDefaultPath?: string }).__pdfDefaultPath
    )
    expect(defaultPath).toBe(pdfPath)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('标签页可以拖拽排序并在重启后保持顺序', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-tabs-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-tabs-user-'))
  const firstPath = join(workDir, 'tab-first.md')
  const secondPath = join(workDir, 'tab-second.md')
  writeFileSync(firstPath, '# 第一个\n', 'utf-8')
  writeFileSync(secondPath, '# 第二个\n', 'utf-8')

  const launchOptions = {
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  }

  const app = await electron.launch(launchOptions)
  try {
    const window = await app.firstWindow()
    const firstTab = window.locator('.tab', { hasText: 'tab-first.md' })
    const secondTab = window.locator('.tab', { hasText: 'tab-second.md' })
    await expect(firstTab).toBeVisible()
    await expect(secondTab).toBeVisible()

    // 拖到第二个标签右半区，插入位置落在它之后
    const secondBox = await secondTab.boundingBox()
    if (!secondBox) throw new Error('标签页未完成布局')
    await firstTab.dragTo(secondTab, {
      targetPosition: { x: secondBox.width / 2 + 20, y: secondBox.height / 2 }
    })

    const readNames = async (): Promise<string[]> =>
      (await window.locator('.tab-name').allTextContents()).map((name) => name.trim())
    await expect.poll(readNames).toEqual(['tab-second.md', 'tab-first.md'])

    // 等待会话防抖写入后再关闭
    await window.waitForTimeout(1200)
  } finally {
    await app.close()
  }

  const restored = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    const window = await restored.firstWindow()
    // 会话恢复是异步的，轮询到顺序稳定为止
    await expect
      .poll(async () =>
        (await window.locator('.tab-name').allTextContents()).map((name) => name.trim())
      )
      .toEqual(['tab-second.md', 'tab-first.md'])
  } finally {
    await restored.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
