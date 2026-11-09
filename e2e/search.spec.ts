import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
const appEntry = join(projectRoot, 'out/main/index.js')

function getLaunchEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value
  }
  return env
}

test('编辑区搜索、循环导航、替换与预览搜索', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-search-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-search-user-'))
  const mdPath = join(workDir, 'search.md')
  writeFileSync(mdPath, '# 搜索示例\n\nalpha beta alpha\n\ngamma alpha\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, mdPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const window = await app.firstWindow()
    await expect(window.locator('.tab-name', { hasText: 'search.md' })).toBeVisible()
    await window.bringToFront()

    // 打开搜索并输入关键词
    await window.keyboard.press('Control+f')
    const panel = window.locator('.search-panel')
    await expect(panel).toBeVisible()

    const queryInput = panel.locator('.search-input').first()
    await queryInput.fill('alpha')
    await expect(panel.locator('.search-count')).toHaveText('1/3')
    // 当前项 + 其余匹配各使用一个装饰类
    await expect(window.locator('.markit-search-match, .markit-search-match-active')).toHaveCount(3)

    // 下一个，再从末项循环回首项并提示 HUD
    await queryInput.press('Enter')
    await expect(panel.locator('.search-count')).toHaveText('2/3')
    await queryInput.press('Enter')
    await expect(panel.locator('.search-count')).toHaveText('3/3')
    await queryInput.press('Enter')
    await expect(panel.locator('.search-count')).toHaveText('1/3')
    await expect(window.locator('.search-hud')).toContainText('已到达末尾，已循环到开头')

    // 展开替换行，全部替换
    await panel.locator('button[title="显示替换 (Ctrl+H)"]').click()
    const replaceInput = panel.locator('.search-input').nth(1)
    await replaceInput.fill('omega')
    await panel.locator('button[title="全部替换"]').click()
    await expect(window.locator('.cm-content')).toContainText('omega beta omega')
    await expect(window.locator('.cm-content')).toContainText('gamma omega')
    await expect(panel.locator('.search-count')).toHaveText('无结果')

    // 替换会标记文档已修改；先保存，避免关闭窗口时触发未保存确认
    await window.keyboard.press('Control+s')
    await expect(window.locator('.tab-dot')).toHaveCount(0)

    // 仅预览布局下搜索渲染结果，高亮通过 CSS Custom Highlight API 注册
    await queryInput.fill('omega')
    await expect(panel.locator('.search-count')).toHaveText('1/3')

    await window.locator('.tb-btn[title="仅预览"]').click()
    await expect(window.locator('.editor-pane')).toHaveCount(0)
    await expect(panel.locator('.search-count')).toHaveText('1/3')
    await expect.poll(() => window.evaluate(() => CSS.highlights.has('markit-search'))).toBe(true)
    await expect
      .poll(() => window.evaluate(() => CSS.highlights.has('markit-search-active')))
      .toBe(true)

    // 仅预览下循环导航
    await queryInput.press('Shift+Enter')
    await expect(panel.locator('.search-count')).toHaveText('3/3')
    await expect(window.locator('.search-hud')).toContainText('已到达开头，已循环到末尾')

    // 关闭后清除面板与高亮
    await queryInput.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect.poll(() => window.evaluate(() => CSS.highlights.has('markit-search'))).toBe(false)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
