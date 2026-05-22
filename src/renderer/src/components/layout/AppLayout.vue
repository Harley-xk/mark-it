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

const app = useAppStore()
const { exportPdf } = usePdfExport()
</script>

<template>
  <div class="app-layout" :class="[app.themeMode]">
    <TitleBar />
    <Toolbar />
    <div class="main-area">
      <OutlinePanel v-if="app.showOutline" />
      <div class="content-area">
        <SplitPane
          v-if="app.isSplitMode"
          :layout="app.layoutMode"
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
      @export="exportPdf"
    />
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
  background: rgba(245, 245, 250, 0.85);
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
