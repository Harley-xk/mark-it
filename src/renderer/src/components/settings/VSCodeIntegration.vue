<!--
  作者: Harley-xk
  创建: 2026-11-10

  描述: 设置页中的 VSCode 资源管理器集成开关与状态展示
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { VSCodeInstallation, VSCodeVariant } from '../../../../shared/integration-types'

const props = defineProps<{ isDark: boolean }>()

const installations = ref<VSCodeInstallation[]>([])
const loading = ref(true)
const busyVariant = ref<VSCodeVariant | null>(null)
const error = ref<string | null>(null)
const feedback = ref<string | null>(null)

const variantLabels: Record<VSCodeVariant, string> = {
  stable: 'VS Code',
  insiders: 'VS Code Insiders'
}

const hasInstallations = computed(() => installations.value.length > 0)

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    installations.value = await window.api.integration.detectVSCode()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function toggle(installation: VSCodeInstallation): Promise<void> {
  if (installation.unsupportedReason || busyVariant.value) return
  busyVariant.value = installation.variant
  error.value = null
  feedback.value = null
  try {
    const method = installation.installed
      ? window.api.integration.uninstallVSCode
      : window.api.integration.installVSCode
    const result = await method(installation.variant)
    if (!result.ok) {
      error.value = result.error ?? '操作失败'
      return
    }
    feedback.value = result.needsRestart ? '重启 VSCode 后生效' : '已完成'
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busyVariant.value = null
  }
}

async function updateExtension(installation: VSCodeInstallation): Promise<void> {
  if (busyVariant.value) return
  busyVariant.value = installation.variant
  error.value = null
  feedback.value = null
  try {
    const result = await window.api.integration.installVSCode(installation.variant)
    if (!result.ok) {
      error.value = result.error ?? '更新失败'
      return
    }
    feedback.value = '扩展已更新，重启 VSCode 后生效'
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busyVariant.value = null
  }
}

onMounted(refresh)
</script>

<template>
  <div class="setting-section" :class="{ light: !props.isDark }">
    <div class="section-title">编辑器集成</div>

    <div v-if="loading" class="integration-empty">正在检测 VSCode…</div>
    <div v-else-if="!hasInstallations" class="integration-empty">
      未检测到 VSCode。安装并启动一次 VSCode 后再打开设置。
    </div>

    <div v-else class="integration-list">
      <div
        v-for="installation in installations"
        :key="installation.variant"
        class="integration-item"
      >
        <div class="integration-main">
          <div class="integration-title-row">
            <span class="integration-name">{{ variantLabels[installation.variant] }}</span>
            <span v-if="installation.installed" class="integration-state">已安装</span>
            <span v-if="installation.needsUpdate" class="integration-update">需更新</span>
          </div>

          <span v-if="installation.unsupportedReason" class="integration-hint">
            {{ installation.unsupportedReason }}
          </span>
          <template v-else>
            <span class="integration-hint">
              {{
                installation.installed
                  ? '可在资源管理器右键 Markdown 文件，使用 MarkIt 打开'
                  : '安装后重启 VSCode，即可在资源管理器右键打开 Markdown'
              }}
            </span>
            <span v-if="installation.installedVersion" class="integration-path">
              扩展 v{{ installation.installedVersion }}
            </span>
            <span class="integration-path" :title="installation.extensionsDir">
              {{ installation.extensionsDir }}
            </span>
          </template>
        </div>

        <button
          v-if="!installation.unsupportedReason"
          class="switch"
          :class="{ active: installation.installed }"
          role="switch"
          :aria-checked="installation.installed"
          :aria-label="
            installation.installed ? '卸载 MarkIt VSCode 扩展' : '安装 MarkIt VSCode 扩展'
          "
          :disabled="busyVariant !== null"
          @click="toggle(installation)"
        >
          <span class="switch-thumb"></span>
        </button>
      </div>

      <button
        v-for="installation in installations.filter((item) => item.needsUpdate)"
        :key="`update-${installation.variant}`"
        class="integration-update-btn"
        :disabled="busyVariant !== null"
        @click="updateExtension(installation)"
      >
        更新 {{ variantLabels[installation.variant] }} 扩展
      </button>
    </div>

    <div v-if="feedback" class="integration-feedback">{{ feedback }}</div>
    <div v-if="error" class="integration-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
}

.integration-list {
  display: flex;
  flex-direction: column;
}

.integration-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
}

.integration-item + .integration-item {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.integration-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.integration-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.integration-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.integration-state,
.integration-update {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
}

.integration-state {
  color: #8fb4ff;
  background: rgba(108, 155, 255, 0.1);
  border: 1px solid rgba(108, 155, 255, 0.22);
}

.integration-update {
  color: #f5bf65;
  background: rgba(245, 191, 101, 0.08);
  border: 1px solid rgba(245, 191, 101, 0.2);
}

.integration-hint {
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.42);
}

.integration-path {
  overflow: hidden;
  font-size: 10px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.26);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.integration-empty {
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.35);
}

.integration-feedback,
.integration-error {
  font-size: 11px;
  line-height: 1.55;
}

.integration-feedback {
  color: #77c9a0;
}

.integration-error {
  color: #ff7b72;
  word-break: break-word;
}

.integration-update-btn {
  align-self: flex-start;
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(108, 155, 255, 0.25);
  border-radius: 7px;
  background: rgba(108, 155, 255, 0.08);
  color: #8fb4ff;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.integration-update-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.switch {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 22px;
  padding: 0;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s ease;
}

.switch:disabled {
  opacity: 0.45;
  cursor: default;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  transition:
    transform 0.15s ease,
    background 0.15s ease;
}

.switch.active {
  background: rgba(108, 155, 255, 0.35);
  border-color: rgba(108, 155, 255, 0.5);
}

.switch.active .switch-thumb {
  transform: translateX(18px);
  background: #8fb4ff;
}

.light .integration-item + .integration-item {
  border-top-color: rgba(0, 0, 0, 0.06);
}

.light.section-title,
.light .section-title {
  color: rgba(0, 0, 0, 0.3);
}

.light .integration-name {
  color: rgba(0, 0, 0, 0.68);
}

.light .integration-hint {
  color: rgba(0, 0, 0, 0.42);
}

.light .integration-path {
  color: rgba(0, 0, 0, 0.28);
}

.light .integration-empty {
  color: rgba(0, 0, 0, 0.38);
}

.light .switch {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.06);
}

.light .switch-thumb {
  background: rgba(0, 0, 0, 0.4);
}

.light .switch.active {
  background: rgba(59, 130, 246, 0.28);
  border-color: rgba(59, 130, 246, 0.45);
}

.light .switch.active .switch-thumb {
  background: #3b82f6;
}
</style>
