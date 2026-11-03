import { createApp } from 'vue'
import { createPinia } from 'pinia'
import UpdateWindow from './UpdateWindow.vue'

const app = createApp(UpdateWindow)
app.use(createPinia())
app.mount('#app')
