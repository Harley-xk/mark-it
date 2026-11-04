import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Electron 应用同一时刻只允许一个实例，串行执行避免单实例锁互相干扰
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure'
  }
})
