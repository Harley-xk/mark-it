<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import { usePdfExport } from '../../composables/usePdfExport'
import TitleBar from './TitleBar.vue'
import Toolbar from './Toolbar.vue'
import StatusBar from './StatusBar.vue'
import SplitPane from './SplitPane.vue'
import OutlinePanel from '../outline/OutlinePanel.vue'
import MarkdownEditor from '../editor/MarkdownEditor.vue'
import MarkdownPreview from '../preview/MarkdownPreview.vue'
import PdfExportDialog from '../export/PdfExportDialog.vue'
import SettingsDialog from '../settings/SettingsDialog.vue'

const app = useAppStore()
const { exportPdf } = usePdfExport()

async function onExport(options: any) {
  try {
    await exportPdf(options)
  } catch (err) {
    console.error('PDF export failed:', err)
  }
}
</script>

<template>
  <div class="app-layout" :class="[app.resolvedTheme]">
    <TitleBar />
    <Toolbar />
    <div class="main-area">
      <OutlinePanel v-if="app.showOutline" />
      <div class="content-area">
        <SplitPane
          v-if="app.isSplitMode"
          :ratio="app.splitRatio"
          @update:ratio="app.splitRatio = $event"
        >
          <template #left>
            <MarkdownEditor v-if="app.layoutMode === 'edit-left'" />
            <MarkdownPreview v-else />
          </template>
          <template #right>
            <MarkdownEditor v-if="app.layoutMode === 'edit-right'" />
            <MarkdownPreview v-else />
          </template>
        </SplitPane>
        <MarkdownEditor v-else-if="app.layoutMode === 'edit-only'" class="full-pane" />
        <MarkdownPreview v-else class="full-pane" />
      </div>
    </div>
    <StatusBar />
    <PdfExportDialog
      :visible="app.showPdfDialog"
      @close="app.showPdfDialog = false"
      @export="onExport"
    />
    <SettingsDialog />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgba(18, 18, 24, 0.85);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  color: #e0e0e0;
}

.app-layout.light {
  background: #ffffff;
  color: #1a1a2e;
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.full-pane {
  width: 100%;
  height: 100%;
}
</style>

<style>
/* ── Light theme overrides (global, non-scoped) ── */

/* TitleBar */
.light .title-bar {
  background: #ffffff;
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
.light .app-title {
  color: rgba(0, 0, 0, 0.65);
}
.light .file-name {
  color: rgba(0, 0, 0, 0.8);
}

/* Toolbar */
.light .toolbar {
  background: #ffffff;
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
.light .tb-btn {
  color: rgba(0, 0, 0, 0.7);
}
.light .tb-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.9);
}
.light .tb-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.light .tb-btn.active:hover {
  background: rgba(59, 130, 246, 0.15);
}
.light .toolbar-separator {
  background: rgba(0, 0, 0, 0.08);
}
.light .export-btn {
  color: rgba(59, 130, 246, 0.6);
}
.light .export-btn:hover {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}

/* StatusBar */
.light .status-bar {
  background: #ffffff;
  border-top-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.55);
}
.light .status-sep {
  color: rgba(0, 0, 0, 0.2);
}

/* SplitPane */
.light .divider {
  background: rgba(0, 0, 0, 0.08);
}
.light .divider:hover,
.light .divider.dragging {
  background: rgba(59, 130, 246, 0.4);
}

/* OutlinePanel */
.light .outline-panel {
  background: #ffffff;
  border-right-color: rgba(0, 0, 0, 0.06);
}
.light .outline-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
.light .outline-title {
  color: rgba(0, 0, 0, 0.55);
}
.light .outline-item {
  color: rgba(0, 0, 0, 0.7);
}
.light .outline-item:hover {
  color: rgba(0, 0, 0, 0.9);
  background: rgba(59, 130, 246, 0.06);
}
.light .outline-empty {
  color: rgba(0, 0, 0, 0.3);
}

/* Preview toolbar */
.light .preview-toolbar {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
.light .preview-container {
  background: #ffffff;
}
.light .preview-content {
  color: #374151;
}
</style>
