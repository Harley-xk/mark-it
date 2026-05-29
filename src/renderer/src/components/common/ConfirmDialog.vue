<script setup lang="ts">
import { useAppStore } from '../../stores/app'

defineProps<{
  visible: boolean
  title?: string
  message?: string
}>()

const emit = defineEmits<{
  save: []
  discard: []
  cancel: []
}>()

const app = useAppStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="confirm-overlay" @click.self="emit('cancel')">
        <div class="confirm-dialog" :class="[app.resolvedTheme]">
          <div class="confirm-header">
            <span class="confirm-title">{{ title || '未保存的修改' }}</span>
            <button class="close-btn" @click="emit('cancel')">&times;</button>
          </div>
          <div class="confirm-body">
            {{ message || '当前文件有未保存的修改，是否保存？' }}
          </div>
          <div class="confirm-actions">
            <button class="btn btn-danger" @click="emit('discard')">放弃修改</button>
            <button class="btn btn-primary" @click="emit('save')">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 440px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.confirm-dialog.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s ease;
}

.close-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

.light .close-btn {
  color: rgba(0, 0, 0, 0.3);
}

.light .close-btn:hover {
  color: rgba(0, 0, 0, 0.7);
}

.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.light .confirm-title {
  color: #1a1a2e;
}

.confirm-body {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 20px;
  line-height: 1.5;
}

.light .confirm-body {
  color: rgba(0, 0, 0, 0.55);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.btn-primary {
  background: #6c9bff;
  color: #fff;
}

.btn-primary:hover {
  background: #5a8aee;
}

.light .btn-primary {
  background: #3b82f6;
}

.light .btn-primary:hover {
  background: #2563eb;
}

/* Transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.15s ease;
}

.dialog-enter-active .confirm-dialog,
.dialog-leave-active .confirm-dialog {
  transition: transform 0.15s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .confirm-dialog,
.dialog-leave-to .confirm-dialog {
  transform: scale(0.95);
}
</style>
