import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    define: {
      // 活跃度上报的 appSecret 只在构建时注入，不写入源码与公开仓库
      __MARKIT_APPHUB_APP_SECRET__: JSON.stringify(process.env.MARKIT_APPHUB_APP_SECRET ?? '')
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // 运行时资源（如应用图标），避免在渲染层复制一份二进制
        '@resources': resolve('resources')
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // 独立的更新详情窗口
          update: resolve(__dirname, 'src/renderer/update.html'),
          // 独立的设置窗口
          settings: resolve(__dirname, 'src/renderer/settings.html')
        }
      }
    }
  }
})
