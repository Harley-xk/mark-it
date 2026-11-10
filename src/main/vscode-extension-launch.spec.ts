import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createLaunchEnvironment } = require('../../resources/vscode-extension/launch-env') as {
  createLaunchEnvironment: (environment: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
}

describe('VSCode 扩展启动环境', () => {
  it('应移除 ELECTRON_RUN_AS_NODE 并保留其它变量', () => {
    const environment = {
      ELECTRON_RUN_AS_NODE: '1',
      APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      PATH: 'C:\\Windows\\System32'
    }

    const launchEnvironment = createLaunchEnvironment(environment)

    expect(launchEnvironment).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(launchEnvironment.APPDATA).toBe(environment.APPDATA)
    expect(launchEnvironment.PATH).toBe(environment.PATH)
  })

  it('应只处理环境副本而不修改扩展宿主环境', () => {
    const environment = { ELECTRON_RUN_AS_NODE: '1' }

    createLaunchEnvironment(environment)

    expect(environment.ELECTRON_RUN_AS_NODE).toBe('1')
  })
})
