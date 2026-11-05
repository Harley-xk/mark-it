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
