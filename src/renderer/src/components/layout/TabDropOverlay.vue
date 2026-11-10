<!--
  作者: Harley-xk
  创建: 2026-11-10

  描述: 跨编辑窗口拖拽标签时的目标窗口高亮与释放提示
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { TabDragTargetState } from '../../../../shared/window-types'

const active = ref(false)
const tabName = ref('')
let offTarget: (() => void) | null = null

onMounted(() => {
  offTarget = window.api.onTabDragTarget((state: TabDragTargetState) => {
    active.value = state.active
    if (state.active) tabName.value = state.tabName
  })
})

onUnmounted(() => {
  offTarget?.()
  offTarget = null
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tab-drop">
      <div v-if="active" class="tab-drop-overlay" aria-hidden="true">
        <div class="tab-drop-message">
          <span class="tab-drop-dot"></span>
          松开以移动「{{ tabName }}」到此窗口
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tab-drop-overlay {
  position: fixed;
  inset: 5px;
  z-index: 2500;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 52px;
  border: 2px dashed rgba(108, 155, 255, 0.75);
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 0%, rgba(108, 155, 255, 0.16), transparent 46%),
    rgba(25, 32, 48, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.tab-drop-message {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(520px, 80vw);
  padding: 8px 14px;
  border: 1px solid rgba(108, 155, 255, 0.34);
  border-radius: 999px;
  background: rgba(26, 34, 52, 0.94);
  color: #eef3ff;
  font-size: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-drop-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #83a9ff;
  box-shadow: 0 0 0 4px rgba(108, 155, 255, 0.16);
}

:global(.light) .tab-drop-overlay {
  border-color: rgba(59, 130, 246, 0.62);
  background:
    radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.12), transparent 46%),
    rgba(59, 130, 246, 0.035);
}

:global(.light) .tab-drop-message {
  border-color: rgba(59, 130, 246, 0.28);
  background: rgba(255, 255, 255, 0.96);
  color: #1f2937;
  box-shadow: 0 8px 28px rgba(48, 60, 86, 0.16);
}

:global(.light) .tab-drop-dot {
  background: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.tab-drop-enter-active,
.tab-drop-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.tab-drop-enter-from,
.tab-drop-leave-to {
  opacity: 0;
  transform: scale(0.995);
}
</style>
