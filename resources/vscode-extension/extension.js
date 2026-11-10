/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: VSCode 资源管理器右键启动 MarkIt 的轻量扩展
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const vscode = require('vscode')
const { execFile } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/** 兼容 app.name 可能生成的 “Mark It” 与历史文档中的 “mark-it” 目录名 */
function candidateUserDataDirs() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return [join(appData, 'mark-it'), join(appData, 'Mark It')]
  }
  if (process.platform === 'darwin') {
    const support = join(homedir(), 'Library', 'Application Support')
    return [join(support, 'mark-it'), join(support, 'Mark It')]
  }
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return [join(config, 'mark-it'), join(config, 'Mark It')]
}

function loadLaunchConfig(extensionPath) {
  for (const directory of candidateUserDataDirs()) {
    const config = readJson(join(directory, 'vscode-integration.json'))
    if (config && config.version === 1 && typeof config.exePath === 'string') return config
  }
  const fallback = readJson(join(extensionPath, 'markit-path.json'))
  if (fallback && fallback.version === 1 && typeof fallback.exePath === 'string') return fallback
  return null
}

function showLaunchError(error) {
  if (error) vscode.window.showErrorMessage(`启动 MarkIt 失败：${error.message}`)
}

function launchWithExecutable(config, targets) {
  execFile(config.exePath, targets, { windowsHide: true }, showLaunchError)
}

function launch(config, targets) {
  if (
    process.platform === 'darwin' &&
    config.launchStrategy === 'open-app' &&
    typeof config.appPath === 'string'
  ) {
    execFile(
      '/usr/bin/open',
      ['-a', config.appPath, ...targets],
      { windowsHide: true },
      (error) => {
        if (error) launchWithExecutable(config, targets)
      }
    )
    return
  }
  launchWithExecutable(config, targets)
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markit.openFile', (uri, selectedUris) => {
      const candidates = Array.isArray(selectedUris) && selectedUris.length ? selectedUris : [uri]
      const targets = []
      for (const item of candidates) {
        const filePath = item && typeof item.fsPath === 'string' ? item.fsPath : ''
        if (!filePath || !MARKDOWN_EXTENSION.test(filePath) || targets.includes(filePath)) continue
        targets.push(filePath)
      }
      if (targets.length === 0) return

      const config = loadLaunchConfig(context.extensionPath)
      if (!config) {
        vscode.window.showErrorMessage('启动 MarkIt 失败：未找到 MarkIt 启动配置，请重启 MarkIt')
        return
      }
      launch(config, targets)
    })
  )
}

function deactivate() {
  // 扩展没有需要主动释放的全局资源
}

module.exports = { activate, deactivate }
