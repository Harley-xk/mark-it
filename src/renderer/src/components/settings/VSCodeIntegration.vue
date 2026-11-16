<!--
  作者: Harley-xk
  创建: 2026-11-10

  描述: 设置窗口中的 VS Code 资源管理器集成状态与操作
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import type { VSCodeInstallation, VSCodeVariant } from '../../../../shared/integration-types'

defineProps<{ isDark: boolean }>()

const { locale, t } = useI18n()

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
const hasUpdates = computed(() => installations.value.some((item) => item.needsUpdate))

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
      error.value = result.error ?? t('vscode.actionFailed')
      return
    }
    feedback.value = result.needsRestart ? t('vscode.feedbackRestart') : t('vscode.feedbackDone')
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
      error.value = result.error ?? t('vscode.updateFailed')
      return
    }
    feedback.value = t('vscode.feedbackUpdatedRestart')
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busyVariant.value = null
  }
}

onMounted(refresh)
// 主进程返回的 unsupportedReason 按语言生成，切换语言后重新探测一次
watch(locale, () => {
  void refresh()
})
</script>

<template>
  <div class="section">
    <div class="section-heading">
      <div>
        <h2>{{ t('vscode.title') }}</h2>
        <p>{{ t('vscode.description') }}</p>
      </div>
      <button
        v-if="hasUpdates"
        class="text-button"
        :disabled="busyVariant !== null"
        @click="refresh"
      >
        {{ t('vscode.refresh') }}
      </button>
    </div>

    <div v-if="loading" class="setting-card integration-empty">{{ t('vscode.detecting') }}</div>
    <div v-else-if="!hasInstallations" class="setting-card integration-empty">
      {{ t('vscode.notDetected') }}
    </div>
    <div v-else class="setting-card">
      <div
        v-for="installation in installations"
        :key="installation.variant"
        class="setting-row integration-row"
      >
        <div class="integration-copy">
          <span class="integration-icon">
            <svg
              v-if="installation.variant === 'stable'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"></path>
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            >
              <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"></path>
              <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"></path>
            </svg>
          </span>
          <div class="setting-copy">
            <div class="setting-title-line">
              <h3>{{ variantLabels[installation.variant] }}</h3>
              <span v-if="installation.installed" class="status-badge success">{{
                t('vscode.installed')
              }}</span>
              <span v-else class="status-badge">{{ t('vscode.notInstalled') }}</span>
              <span v-if="installation.needsUpdate" class="status-badge warning">{{
                t('vscode.needsUpdate')
              }}</span>
            </div>
            <p v-if="installation.unsupportedReason">
              {{ installation.unsupportedReason }}
            </p>
            <template v-else>
              <p>
                {{ installation.installed ? t('vscode.installedHint') : t('vscode.installHint') }}
              </p>
              <span class="path-line" :title="installation.extensionsDir">
                {{ installation.extensionsDir }}
              </span>
            </template>
          </div>
        </div>

        <div class="integration-actions">
          <button
            v-if="installation.needsUpdate"
            class="secondary-button"
            :disabled="busyVariant !== null"
            @click="updateExtension(installation)"
          >
            {{ t('vscode.updateExtension') }}
          </button>
          <button
            v-if="!installation.unsupportedReason"
            class="switch"
            :class="{ on: installation.installed }"
            role="switch"
            :aria-checked="installation.installed"
            :aria-label="
              installation.installed ? t('vscode.uninstallAria') : t('vscode.installAria')
            "
            :disabled="busyVariant !== null"
            @click="toggle(installation)"
          >
            <span></span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="feedback" class="integration-feedback">{{ feedback }}</div>
    <div v-if="error" class="integration-error">{{ error }}</div>

    <div class="info-strip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 11v5M12 8h.01"></path>
      </svg>
      <span>{{ t('vscode.info') }}</span>
    </div>
  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 13px;
}

.section-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 660;
}

.section-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.text-button {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.setting-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--card-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  min-height: 60px;
  padding: 12px 14px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--border);
}

.integration-copy {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.integration-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--inset-bg);
  color: var(--accent);
}

.integration-icon svg {
  width: 19px;
  height: 19px;
}

.setting-copy {
  min-width: 0;
}

.setting-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-copy h3 {
  margin: 0;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 630;
}

.setting-copy p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.path-line {
  display: block;
  max-width: 100%;
  margin-top: 4px;
  overflow: hidden;
  color: var(--text-faint);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.integration-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
}

.status-badge {
  padding: 2px 7px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 12px;
  font-weight: 650;
}

.status-badge.success {
  border-color: var(--success-border);
  background: var(--success-bg);
  color: var(--success);
}

.status-badge.warning {
  border-color: rgba(228, 183, 107, 0.2);
  background: var(--warning-bg);
  color: var(--warning);
}

.switch {
  position: relative;
  width: 39px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--inset-bg);
  cursor: pointer;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;
}

.switch.on {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.switch.on span {
  transform: translateX(17px);
  background: var(--accent);
}

.switch:disabled,
.secondary-button:disabled,
.text-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.secondary-button {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.integration-empty {
  padding: 18px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.integration-feedback,
.integration-error {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.55;
}

.integration-feedback {
  color: var(--success);
}

.integration-error {
  color: var(--danger);
  word-break: break-word;
}

.info-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--inset-bg);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.info-strip svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--accent);
}

@media (max-width: 650px) {
  .setting-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .integration-actions {
    align-self: flex-end;
  }
}
</style>
