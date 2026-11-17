<!--
  作者: Harley-xk
  创建: 2026-11-17

  描述: 拖入系统文件时的窗口落点提示
-->
<script setup lang="ts">
import { useI18n } from '../../i18n'

defineProps<{ active: boolean }>()
const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <Transition name="file-drop">
      <div v-if="active" class="file-drop-overlay" aria-hidden="true">
        <div class="file-drop-message">{{ t('drop.hint') }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.file-drop-overlay {
  position: fixed;
  inset: 5px;
  z-index: 2600;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 52px;
  border: 2px dashed rgba(108, 155, 255, 0.75);
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 0%, rgba(108, 155, 255, 0.18), transparent 46%),
    rgba(25, 32, 48, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.file-drop-message {
  padding: 8px 16px;
  border: 1px solid rgba(108, 155, 255, 0.34);
  border-radius: 999px;
  background: rgba(26, 34, 52, 0.94);
  color: #eef3ff;
  font-size: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
}

:global(.light .file-drop-message) {
  background: rgba(255, 255, 255, 0.96);
  color: #1f2a3d;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
}

.file-drop-enter-active,
.file-drop-leave-active {
  transition: opacity 0.14s ease;
}

.file-drop-enter-from,
.file-drop-leave-to {
  opacity: 0;
}
</style>
