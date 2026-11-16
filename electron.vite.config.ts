import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

/**
 * 生产环境的 CSP。开发模式不注入，避免 Vite HMR 的 WebSocket 与内联样式被拦截；
 * 预览主题通过动态创建的 <style> 注入，因此 style-src 必须保留 'unsafe-inline'。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file: markit-file: https: http:",
  "font-src 'self' data:",
  "media-src 'self' markit-file: data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** 向三个渲染入口注入生产 CSP，只在 electron-vite build 时生效 */
function productionCspPlugin(): Plugin {
  return {
    name: 'markit-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY
            },
            injectTo: 'head-prepend'
          }
        ]
      }
    }
  }
}

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
    plugins: [vue(), productionCspPlugin()],
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
