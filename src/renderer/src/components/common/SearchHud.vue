<!--
  * 作者: Harley-xk
  * 创建: 2026-11-09
  *
  * 描述: 搜索循环导航与替换结果的临时提示
-->
<script setup lang="ts">
import { useSearchStore } from '../../stores/search'

const search = useSearchStore()
</script>

<template>
  <Transition name="search-hud">
    <div v-if="search.hudVisible" class="search-hud" role="status" aria-live="polite">
      {{ search.hudMessage }}
    </div>
  </Transition>
</template>

<style scoped>
.search-hud {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(30, 30, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.86);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

:global(.light .search-hud) {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
  color: rgba(0, 0, 0, 0.75);
}

.search-hud-enter-active,
.search-hud-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.search-hud-enter-from,
.search-hud-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}
</style>
