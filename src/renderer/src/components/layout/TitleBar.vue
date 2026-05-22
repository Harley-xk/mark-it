<script setup lang="ts">
import { useAppStore } from '../../stores/app'

const app = useAppStore()
</script>

<template>
  <div class="title-bar">
    <div class="drag-region">
      <span class="app-title">MarkIt</span>
      <span v-if="app.isModified" class="modified-dot"></span>
      <span class="file-name">{{ app.fileName }}</span>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 36px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  -webkit-app-region: drag;
  user-select: none;
}

.drag-region {
  padding-left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  flex: 1;
}

.app-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.5px;
}

.file-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.modified-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c9bff;
}

:global(.light) .title-bar {
  background: rgba(0, 0, 0, 0.02);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:global(.light) .app-title {
  color: rgba(0, 0, 0, 0.4);
}

:global(.light) .file-name {
  color: rgba(0, 0, 0, 0.6);
}
</style>
