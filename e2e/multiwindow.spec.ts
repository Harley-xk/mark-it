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

interface WindowDisplaySnapshot {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  focused: boolean
  visible: boolean
}

test('标签可迁移到新编辑窗口并随窗口一起恢复', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-windows-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-windows-user-'))
  const firstPath = join(workDir, 'window-first.md')
  const secondPath = join(workDir, 'window-second.md')
  writeFileSync(firstPath, '# 第一个窗口文档\n', 'utf-8')
  writeFileSync(secondPath, '# 第二个窗口文档\n', 'utf-8')

  const launchOptions = {
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  }

  const app = await electron.launch(launchOptions)
  try {
    const source = await app.firstWindow()
    await expect(source.locator('.tab-name', { hasText: 'window-first.md' })).toBeVisible()
    await expect(source.locator('.tab-name', { hasText: 'window-second.md' })).toBeVisible()

    await source.locator('.tab', { hasText: 'window-first.md' }).click()
    await source.locator('.cm-content').click()
    await source.keyboard.press('Control+End')
    await source.keyboard.type(' undo-history')
    await expect(source.locator('.cm-content')).toContainText('undo-history')
    await source.keyboard.press('Control+s')
    await expect(source.locator('.tab-dot')).toHaveCount(0)

    const targetPromise = app.waitForEvent('window')
    await source.locator('.tab', { hasText: 'window-first.md' }).click({ button: 'right' })
    await source.locator('.tab-context-menu .ctx-item', { hasText: '在新窗口中打开' }).click()
    const target = await targetPromise

    await expect(target.locator('.tab-name', { hasText: 'window-first.md' })).toBeVisible()
    await expect(target.locator('.cm-content')).toContainText('undo-history')
    await expect(source.locator('.tab-name', { hasText: 'window-first.md' })).toHaveCount(0)
    await expect(source.locator('.tab-name', { hasText: 'window-second.md' })).toBeVisible()
    await expect.poll(() => app.windows().length).toBe(2)

    await target.locator('.cm-content').click()
    await target.keyboard.press('Control+z')
    await expect(target.locator('.cm-content')).not.toContainText('undo-history')
    await target.keyboard.press('Control+s')
    await expect(target.locator('.tab-dot')).toHaveCount(0)

    // 等待两个窗口的会话防抖写入，再模拟完整退出与重启。
    await source.waitForTimeout(1200)
  } finally {
    await app.close()
  }

  const restored = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })
  try {
    await expect.poll(() => restored.windows().length).toBe(2)
    await expect
      .poll(async () => {
        const names = await Promise.all(
          restored.windows().map(async (window) => window.locator('.tab-name').allTextContents())
        )
        return names
          .flat()
          .map((name) => name.trim())
          .sort()
      })
      .toEqual(['window-first.md', 'window-second.md'])

    const firstRestored = (
      await Promise.all(
        restored.windows().map(async (window) => ({
          window,
          count: await window.locator('.tab-name', { hasText: 'window-first.md' }).count()
        }))
      )
    ).find((item) => item.count > 0)?.window
    if (!firstRestored) throw new Error('未找到迁移后的首个文档窗口')
    await firstRestored.locator('.cm-content').click()
    await firstRestored.keyboard.press('Control+y')
    await expect(firstRestored.locator('.cm-content')).toContainText('undo-history')
    await firstRestored.keyboard.press('Control+z')
    await firstRestored.keyboard.press('Control+s')
    await expect(firstRestored.locator('.tab-dot')).toHaveCount(0)
  } finally {
    await restored.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('设置窗口可以在多编辑窗口中复用并保持全局单实例', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-windows-settings-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const first = await app.firstWindow()
    await first.bringToFront()
    await first.locator('.cm-content').click()
    const secondPromise = app.waitForEvent('window')
    await first.keyboard.press('Control+Shift+n')
    const second = await secondPromise
    await expect(second.locator('.app-layout')).toBeVisible()

    const settingsPromise = app.waitForEvent('window')
    await second.keyboard.press('Control+,')
    const settings = await settingsPromise
    await expect(settings.locator('.settings-window')).toBeVisible()

    await first.keyboard.press('Control+,')
    await expect.poll(() => app.windows().length).toBe(3)
    await expect(settings.locator('.settings-window')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('标签可以通过右键菜单移动到已有编辑窗口', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-move-window-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-move-window-user-'))
  const sourcePath = join(workDir, 'existing-source.md')
  const keepPath = join(workDir, 'keep-open.md')
  writeFileSync(sourcePath, '# 移到已有窗口\n', 'utf-8')
  writeFileSync(keepPath, '# 留在源窗口\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, sourcePath, keepPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    await expect(source.locator('.tab-name', { hasText: 'existing-source.md' })).toBeVisible()
    await expect(source.locator('.tab-name', { hasText: 'keep-open.md' })).toBeVisible()
    await source.locator('.cm-content').click()

    const targetPromise = app.waitForEvent('window')
    await source.keyboard.press('Control+Shift+n')
    const target = await targetPromise
    await expect(target.locator('.app-layout')).toBeVisible()
    await expect.poll(() => app.windows().length).toBe(2)

    await source.locator('.tab', { hasText: 'existing-source.md' }).click({ button: 'right' })
    await expect(source.locator('.ctx-label', { hasText: '移动到其他窗口' })).toBeVisible()
    await source.getByRole('menuitem', { name: '窗口 2', exact: true }).click()

    await expect(target.locator('.tab-name', { hasText: 'existing-source.md' })).toBeVisible()
    await expect
      .poll(() => target.evaluate(() => window.api.getWindowContext()))
      .toMatchObject({ pendingTransferId: null })
    await expect(source.locator('.tab-name', { hasText: 'existing-source.md' })).toHaveCount(0)
    await expect.poll(() => app.windows().length).toBe(2)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('全部标签可以合并到已有编辑窗口并关闭源窗口', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-merge-window-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-merge-window-user-'))
  const firstPath = join(workDir, 'merge-first.md')
  const secondPath = join(workDir, 'merge-second.md')
  writeFileSync(firstPath, '# 合并第一个\n', 'utf-8')
  writeFileSync(secondPath, '# 合并第二个\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    await expect(source.locator('.tab-name', { hasText: 'merge-first.md' })).toBeVisible()
    await expect(source.locator('.tab-name', { hasText: 'merge-second.md' })).toBeVisible()
    await source.locator('.cm-content').click()

    const targetPromise = app.waitForEvent('window')
    await source.keyboard.press('Control+Shift+n')
    const target = await targetPromise
    await expect(target.locator('.app-layout')).toBeVisible()

    await source.locator('.tab', { hasText: 'merge-first.md' }).click({ button: 'right' })
    await expect(source.locator('.ctx-label', { hasText: '全部标签' })).toBeVisible()
    await source.locator('.tab-context-menu .ctx-item', { hasText: '全部移动到 窗口 2' }).click()

    await expect(target.locator('.tab-name', { hasText: 'merge-first.md' })).toBeVisible()
    await expect(target.locator('.tab-name', { hasText: 'merge-second.md' })).toBeVisible()
    await expect.poll(() => source.isClosed()).toBe(true)
    await expect.poll(() => app.windows().length).toBe(1)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('拖拽经过其他窗口时可显示目标高亮并正确清除', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-drag-highlight-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    await source.locator('.cm-content').click()
    const targetPromise = app.waitForEvent('window')
    await source.keyboard.press('Control+Shift+n')
    const target = await targetPromise
    await expect(target.locator('.app-layout')).toBeVisible()

    await app.evaluate(({ BrowserWindow }) => {
      const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      targetWindow.webContents.send('window:tab-drag-target', {
        active: true,
        tabName: 'drag-highlight.md',
        sourceWindowId: 'test-source'
      })
    })

    await expect(target.locator('.tab-drop-overlay')).toBeVisible()
    await expect(target.locator('.tab-drop-message')).toContainText('drag-highlight.md')
    await expect(source.locator('.tab-drop-overlay')).toHaveCount(0)

    await app.evaluate(({ BrowserWindow }) => {
      const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      targetWindow.webContents.send('window:tab-drag-target', {
        active: false,
        tabName: '',
        sourceWindowId: 'test-source'
      })
    })
    await expect(target.locator('.tab-drop-overlay')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('常规打开已存在于其他窗口的文件时激活原标签而不是新增副本', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-open-dedupe-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-open-dedupe-user-'))
  const filePath = join(workDir, 'dedupe.md')
  writeFileSync(filePath, '# 跨窗口去重\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, filePath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    await expect(source.locator('.tab-name', { hasText: 'dedupe.md' })).toBeVisible()
    await source.locator('.cm-content').click()

    const targetPromise = app.waitForEvent('window')
    await source.keyboard.press('Control+Shift+n')
    const target = await targetPromise
    await expect(target.locator('.app-layout')).toBeVisible()
    await expect.poll(() => app.windows().length).toBe(2)

    // 模拟系统再次投递同一路径；普通打开应先查找所有窗口的打开文件索引。
    await app.evaluate(({ app: electronApp }, path) => {
      electronApp.emit('second-instance', {}, ['electron', path], process.cwd(), {})
    }, filePath)

    await expect
      .poll(async () => source.locator('.tab-name', { hasText: 'dedupe.md' }).count())
      .toBe(1)
    await expect(target.locator('.tab-name', { hasText: 'dedupe.md' })).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('标签离开标题栏后释放即可创建新窗口', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-titlebar-drop-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-titlebar-drop-user-'))
  const firstPath = join(workDir, 'drag-out-first.md')
  const secondPath = join(workDir, 'drag-out-second.md')
  writeFileSync(firstPath, '# 第一个\n', 'utf-8')
  writeFileSync(secondPath, '# 第二个\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    const tab = source.locator('.tab', { hasText: 'drag-out-first.md' })
    const box = await tab.boundingBox()
    if (!box) throw new Error('标签未完成布局')

    const previewPromise = app.waitForEvent('window', {
      predicate: (page) => page.url().startsWith('data:text/html')
    })
    await source.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await source.mouse.down()
    await source.mouse.move(box.x + box.width / 2, 130, { steps: 8 })
    const preview = await previewPromise
    await expect(preview.locator('.tab-drag-title')).toHaveText('drag-out-first.md')
    await expect(preview.locator('.drag-preview-icon')).toBeVisible()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const dragPreview = BrowserWindow.getAllWindows().find(
            (window) => window.getTitle() === 'tab-drag-preview'
          )
          return dragPreview
            ? {
                visible: dragPreview.isVisible(),
                alwaysOnTop: dragPreview.isAlwaysOnTop(),
                focusable: dragPreview.isFocusable()
              }
            : null
        })
      )
      .toMatchObject({ visible: true, alwaysOnTop: true, focusable: false })

    const targetPromise = app.waitForEvent('window', {
      predicate: (page) => !page.url().startsWith('data:text/html')
    })
    await source.mouse.up()

    const target = await targetPromise
    await expect(target.locator('.tab-name', { hasText: 'drag-out-first.md' })).toBeVisible()
    await expect(source.locator('.tab-name', { hasText: 'drag-out-first.md' })).toHaveCount(0)
    await expect.poll(() => preview.isClosed()).toBe(true)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('标题栏下缘吸附区内的轻微下移仍只执行标签排序', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const workDir = mkdtempSync(join(tmpdir(), 'markit-e2e-titlebar-snap-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-titlebar-snap-user-'))
  const firstPath = join(workDir, 'snap-first.md')
  const secondPath = join(workDir, 'snap-second.md')
  writeFileSync(firstPath, '# 吸附第一个\n', 'utf-8')
  writeFileSync(secondPath, '# 吸附第二个\n', 'utf-8')

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, firstPath, secondPath],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const window = await app.firstWindow()
    const firstTab = window.locator('.tab', { hasText: 'snap-first.md' })
    const secondTab = window.locator('.tab', { hasText: 'snap-second.md' })
    const firstBox = await firstTab.boundingBox()
    const secondBox = await secondTab.boundingBox()
    if (!firstBox || !secondBox) throw new Error('标签未完成布局')

    await window.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
    await window.mouse.down()
    await window.mouse.move(secondBox.x + secondBox.width / 2 + 20, 50, { steps: 8 })
    await window.mouse.up()

    await expect
      .poll(async () =>
        (await window.locator('.tab-name').allTextContents()).map((name) => name.trim())
      )
      .toEqual(['snap-second.md', 'snap-first.md'])
    await expect.poll(() => app.windows().length).toBe(1)
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('用户可见工具窗口跟随触发显示器且重复打开不移动', async () => {
  test.skip(!existsSync(appEntry), '请先执行 npm run build 生成 out/main/index.js')

  const userDataDir = mkdtempSync(join(tmpdir(), 'markit-e2e-window-placement-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: getLaunchEnv()
  })

  try {
    const source = await app.firstWindow()
    await expect(source.locator('.app-layout')).toBeVisible()

    const displays = await app.evaluate(({ screen }) =>
      screen.getAllDisplays().map(({ id, workArea }) => ({ id, workArea }))
    )
    const primaryId = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().id)
    const secondary = displays.find((display) => display.id !== primaryId)
    test.skip(!secondary, '当前环境没有第二块显示器')
    if (!secondary) return

    async function moveFocusedWindowToDisplay(displayId: number): Promise<number | null> {
      return app.evaluate(({ BrowserWindow, screen }, displayId) => {
        const win = BrowserWindow.getFocusedWindow()
        const display = screen.getAllDisplays().find((item) => item.id === displayId)
        if (!win || !display) return null
        if (win.isMaximized()) win.unmaximize()
        const width = Math.max(800, Math.min(1000, display.workArea.width))
        const height = Math.max(600, Math.min(700, display.workArea.height))
        win.setBounds({
          x: display.workArea.x + Math.max(0, Math.floor((display.workArea.width - width) / 2)),
          y: display.workArea.y + Math.max(0, Math.floor((display.workArea.height - height) / 2)),
          width,
          height
        })
        win.show()
        win.focus()
        return screen.getDisplayMatching(win.getBounds()).id
      }, displayId)
    }

    async function getWindowDisplay(title: string): Promise<WindowDisplaySnapshot | null> {
      return app.evaluate(({ BrowserWindow, screen }, title) => {
        const win = BrowserWindow.getAllWindows().find((item) => item.getTitle() === title)
        return win
          ? {
              id: screen.getDisplayMatching(win.getBounds()).id,
              bounds: win.getBounds(),
              focused: win.isFocused(),
              visible: win.isVisible()
            }
          : null
      }, title)
    }

    await source.bringToFront()
    await source.locator('.cm-content').click()
    await expect(moveFocusedWindowToDisplay(secondary.id)).resolves.toBe(secondary.id)

    const settingsPromise = app.waitForEvent('window')
    await source.keyboard.press('Control+,')
    const settings = await settingsPromise
    await expect(settings.locator('.settings-window')).toBeVisible()
    await expect
      .poll(() => getWindowDisplay('MarkIt 设置'))
      .toMatchObject({
        id: secondary.id,
        visible: true
      })
    // 混合缩放显示器下构造参数会被二次放大，必须按目标显示器的 DIP 尺寸收敛
    await expect
      .poll(() => getWindowDisplay('MarkIt 设置'))
      .toMatchObject({
        bounds: {
          width: Math.min(1040, secondary.workArea.width),
          height: Math.min(720, secondary.workArea.height)
        }
      })
    const settingsBounds = (await getWindowDisplay('MarkIt 设置'))?.bounds

    await source.bringToFront()
    await expect(moveFocusedWindowToDisplay(primaryId)).resolves.toBe(primaryId)
    await source.keyboard.press('Control+,')
    await expect.poll(() => app.windows().length).toBe(2)
    await expect
      .poll(() => getWindowDisplay('MarkIt 设置'))
      .toMatchObject({
        id: secondary.id,
        bounds: settingsBounds,
        focused: true
      })

    const newEditorPromise = app.waitForEvent('window')
    await settings.evaluate(() => window.api.createWindow())
    const newEditor = await newEditorPromise
    await expect(newEditor.locator('.app-layout')).toBeVisible()
    const editorWindows = await app.evaluate(({ BrowserWindow, screen }) =>
      BrowserWindow.getAllWindows()
        .filter((win) => win.getTitle() === 'MarkIt')
        .map((win) => ({
          displayId: screen.getDisplayMatching(win.getBounds()).id,
          bounds: win.getBounds()
        }))
    )
    expect(editorWindows.map((win) => win.displayId)).toContain(secondary.id)
    expect(editorWindows).toContainEqual({
      displayId: secondary.id,
      bounds: expect.objectContaining({
        width: Math.min(1280, secondary.workArea.width),
        height: Math.min(800, secondary.workArea.height)
      })
    })

    await settings.close()
    await expect.poll(() => app.windows().length).toBe(2)

    await source.bringToFront()
    await expect(moveFocusedWindowToDisplay(secondary.id)).resolves.toBe(secondary.id)
    const updatePromise = app.waitForEvent('window')
    await source.evaluate(() => window.api.update.openWindow())
    const update = await updatePromise
    await expect(update.locator('.update-window')).toBeVisible()
    await expect
      .poll(() => getWindowDisplay('MarkIt 更新'))
      .toMatchObject({
        id: secondary.id,
        visible: true
      })
    await expect
      .poll(() => getWindowDisplay('MarkIt 更新'))
      .toMatchObject({
        bounds: {
          width: Math.min(560, secondary.workArea.width),
          height: Math.min(680, secondary.workArea.height)
        }
      })
    const updateBounds = (await getWindowDisplay('MarkIt 更新'))?.bounds

    await source.bringToFront()
    await expect(moveFocusedWindowToDisplay(primaryId)).resolves.toBe(primaryId)
    await source.evaluate(() => window.api.update.openWindow())
    await expect.poll(() => app.windows().length).toBe(3)
    await expect
      .poll(() => getWindowDisplay('MarkIt 更新'))
      .toMatchObject({
        id: secondary.id,
        bounds: updateBounds,
        focused: true
      })
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
