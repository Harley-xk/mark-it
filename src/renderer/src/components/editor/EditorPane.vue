<script setup lang="ts">
import EditorToolbar from './EditorToolbar.vue'
import MarkdownEditor from './MarkdownEditor.vue'
</script>

<template>
  <div class="editor-pane">
    <EditorToolbar />
    <div class="editor-body">
      <MarkdownEditor />
    </div>
  </div>
</template>

<style scoped>
.editor-pane {
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
