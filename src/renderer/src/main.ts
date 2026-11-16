/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 渲染进程入口，挂载 Vue 应用并上报未捕获错误
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

window.addEventListener('error', (event) => {
  // Chromium 的 ResizeObserver 提示属于已知噪声，不代表页面异常
  if (event.message.includes('ResizeObserver loop')) return
  window.api.reportRendererError({
    kind: 'error',
    message: event.message || 'Unknown error',
    source: event.filename || undefined,
    stack: event.error instanceof Error ? event.error.stack : undefined
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  window.api.reportRendererError({
    kind: 'unhandledrejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  })
})
