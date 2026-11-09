<script setup lang="ts">
import EditorToolbar from './EditorToolbar.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import SearchPanel from '../common/SearchPanel.vue'
import { useSearchStore } from '../../stores/search'

const search = useSearchStore()
</script>

<template>
  <div class="editor-pane">
    <EditorToolbar />
    <div class="editor-body">
      <MarkdownEditor />
    </div>
    <SearchPanel v-if="search.isOpen && search.surface === 'editor'" />
  </div>
</template>

<style scoped>
.editor-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
