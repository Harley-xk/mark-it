<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/app'
import { useUpdateStore } from '../../stores/update'

const app = useAppStore()
const update = useUpdateStore()

const visible = computed(() => update.showNotice && update.hasUpdate)
const forced = computed(() => update.state.forceUpdate && update.hasUpdate)

function handleView(): void {
  void update.openWindow()
}

function handleDismiss(): void {
  update.dismiss()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="update-fade">
      <!-- 右下角仅提示有新版本；详情（更新说明 / 下载 / 进度）在独立窗口展示 -->
      <div v-if="visible" class="update-toast" :class="app.resolvedTheme" role="status">
        <div class="toast-main">
          <span class="toast-icon" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </span>
          <div class="toast-text">
            <div class="toast-title">
              发现新版本 v{{ update.state.latestVersion }}
              <span v-if="forced" class="toast-badge">重要</span>
            </div>
            <p class="toast-sub">当前版本 v{{ update.state.currentVersion }}</p>
          </div>
        </div>

        <div class="toast-actions">
          <button v-if="!forced" class="btn btn-ghost" @click="handleDismiss">跳过</button>
          <button class="btn btn-primary" @click="handleView">查看</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2500;
  width: 340px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(30, 30, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(20px);
  color: #e0e0e4;
}

.toast-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.toast-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: #8fb4ff;
  background: rgba(108, 155, 255, 0.12);
  border: 1px solid rgba(108, 155, 255, 0.25);
}

.toast-text {
  min-width: 0;
}

.toast-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.toast-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: #ffb020;
  background: rgba(255, 176, 32, 0.12);
  border: 1px solid rgba(255, 176, 32, 0.25);
}

.toast-sub {
  margin-top: 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.toast-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.btn {
  padding: 7px 16px;
  border-radius: 7px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.btn-primary {
  background: rgba(108, 155, 255, 0.15);
  border-color: rgba(108, 155, 255, 0.35);
  color: #8fb4ff;
}

.btn-primary:hover {
  background: rgba(108, 155, 255, 0.25);
}

.btn-ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.55);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

/* 浅色主题 */
.update-toast.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  color: #1a1a2e;
}

.update-toast.light .toast-icon {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.2);
}

.update-toast.light .toast-sub {
  color: rgba(0, 0, 0, 0.45);
}

.update-toast.light .btn-ghost {
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.55);
}

.update-toast.light .btn-ghost:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.8);
}

.update-toast.light .btn-primary {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.update-toast.light .btn-primary:hover {
  background: rgba(59, 130, 246, 0.18);
}

.update-fade-enter-active,
.update-fade-leave-active {
  transition: opacity 0.2s ease;
}

.update-fade-enter-from,
.update-fade-leave-to {
  opacity: 0;
}
</style>
