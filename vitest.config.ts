import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 纯函数测试不依赖 DOM；需要浏览器的能力留在 e2e
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    exclude: ['node_modules', 'out', 'dist']
  }
})
