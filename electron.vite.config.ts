import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main.ts')
      },
      outDir: 'out/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload.ts')
      },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: resolve('.'),
    build: {
      rollupOptions: {
        input: resolve('src/index.html')
      },
      outDir: 'out/renderer'
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  }
})
