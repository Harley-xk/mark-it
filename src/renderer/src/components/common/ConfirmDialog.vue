<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import type { DiffLine } from '../../utils/text-diff'

defineProps<{
  visible: boolean
  title?: string
  message?: string
  saveText?: string
  discardText?: string
  cancelText?: string
  diff?: DiffLine[]
}>()

const emit = defineEmits<{
  save: []
  discard: []
  cancel: []
}>()

const app = useAppStore()

/** 差异行的前缀符号 */
function diffSign(type: DiffLine['type']): string {
  if (type === 'add') return '+'
  if (type === 'remove') return '-'
  return ' '
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="confirm-overlay" @click.self="emit('cancel')">
        <div
          class="confirm-dialog"
          :class="[{ 'with-diff': diff && diff.length > 0 }, app.resolvedTheme]"
        >
          <div class="confirm-header">
            <span class="confirm-title">{{ title || '未保存的修改' }}</span>
            <button class="close-btn" @click="emit('cancel')">&times;</button>
          </div>
          <div class="confirm-body">
            {{ message || '当前文件有未保存的修改，是否保存？' }}
          </div>
          <div v-if="diff && diff.length > 0" class="diff-panel">
            <div class="diff-legend">
              <span class="legend-remove">− 磁盘上的内容</span>
              <span class="legend-add">+ 本地未保存的内容</span>
            </div>
            <div class="diff-body">
              <div
                v-for="(line, index) in diff"
                :key="index"
                class="diff-line"
                :class="line.type"
              >
                <template v-if="line.type === 'gap'">… 省略 {{ line.count }} 行 …</template>
                <template v-else>{{ diffSign(line.type) }} {{ line.text }}</template>
              </div>
            </div>
          </div>
          <div class="confirm-actions">
            <button v-if="cancelText" class="btn btn-secondary" @click="emit('cancel')">
              {{ cancelText }}
            </button>
            <button class="btn btn-danger" @click="emit('discard')">
              {{ discardText || '放弃修改' }}
            </button>
            <button class="btn btn-primary" @click="emit('save')">
              {{ saveText || '保存' }}
            </button>
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

/* 带差异视图时加宽，给长行留出空间 */
.confirm-dialog.with-diff {
  width: 760px;
  max-width: calc(100vw - 48px);
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
  white-space: pre-line;
}

.light .confirm-body {
  color: rgba(0, 0, 0, 0.55);
}

/* ── 文件冲突差异视图 ── */

.diff-panel {
  margin: 0 0 20px;
}

.diff-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 6px;
  font-size: 11.5px;
  user-select: none;
}

.legend-remove {
  color: #ef4444;
}

.legend-add {
  color: #22c55e;
}

.diff-body {
  max-height: 42vh;
  overflow: auto;
  padding: 8px 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.55;
}

.diff-line {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(255, 255, 255, 0.72);
}

.diff-line.add {
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
}

.diff-line.remove {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.diff-line.gap {
  padding: 2px 10px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  user-select: none;
}

.light .diff-body {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
}

.light .diff-line {
  color: rgba(0, 0, 0, 0.7);
}

.light .diff-line.add {
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.light .diff-line.remove {
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.light .diff-line.gap {
  color: rgba(0, 0, 0, 0.3);
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

.btn-secondary {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.75);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.light .btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.65);
}

.light .btn-secondary:hover {
  background: rgba(0, 0, 0, 0.09);
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
