<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TabBar from './TabBar.vue'

// Windows 的系统窗口按钮以 overlay 形式绘制在右上角，需预留宽度；
// macOS 的交通灯在左上角，改为左侧留白
const platform = window.api.platform
const isFullscreen = ref(false)

onMounted(async () => {
  isFullscreen.value = await window.api.isFullscreen()
  window.api.onFullscreenChange((value) => {
    isFullscreen.value = value
  })
})
</script>

<template>
  <div class="title-bar" :class="[platform, { fullscreen: isFullscreen }]">
    <TabBar />
  </div>
</template>

<style scoped>
.title-bar {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  background: rgba(0, 0, 0, 0.14);
  /* 左侧留白，避免第一个标签紧贴窗口边缘 */
  padding-left: 8px;
  /* Windows / Linux 的窗口控制按钮 overlay 宽度 */
  padding-right: 140px;
  -webkit-app-region: drag;
  user-select: none;
}

.title-bar.darwin {
  padding-left: 88px;
  padding-right: 0;
}

.title-bar.linux {
  padding-right: 0;
}

/* 全屏时系统窗口按钮不可见，移除两侧预留 */
.title-bar.fullscreen {
  padding-left: 8px;
  padding-right: 8px;
}
</style>
