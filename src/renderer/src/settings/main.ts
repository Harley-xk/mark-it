/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 独立设置窗口渲染入口
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SettingsWindow from './SettingsWindow.vue'

const app = createApp(SettingsWindow)
app.use(createPinia())
app.mount('#app')
