<script setup lang="ts">
import { ref } from 'vue'
import { useStyle } from '../../composables/useStyle'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const { allStyles, currentStyleId, setStyle, addCustomStyle, removeCustomStyle } = useStyle(() => app.resolvedTheme === 'dark')
const showMenu = ref(false)
const showImport = ref(false)
const importName = ref('')
const importCss = ref('')

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function selectStyle(id: string) {
  setStyle(id)
  showMenu.value = false
}

function handleImport() {
  if (!importName.value.trim() || !importCss.value.trim()) return
  addCustomStyle({
    id: `custom-${Date.now()}`,
    name: importName.value.trim(),
    css: importCss.value,
    isBuiltin: false,
  })
  importName.value = ''
  importCss.value = ''
  showImport.value = false
}

function handleFileImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.css'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const name = file.name.replace(/\.css$/i, '')
    addCustomStyle({
      id: `custom-${Date.now()}`,
      name,
      css: text,
      isBuiltin: false,
    })
  }
  input.click()
}
</script>

<template>
  <div class="style-selector" @mouseleave="showMenu = false">
    <button class="style-btn" @click="toggleMenu">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span>Style</span>
    </button>
    <div v-if="showMenu" class="style-menu">
      <div
        v-for="style in allStyles" :key="style.id"
        class="style-menu-item"
        :class="{ active: currentStyleId === style.id }"
        @click="selectStyle(style.id)"
      >
        <span>{{ style.name }}</span>
        <span v-if="!style.isBuiltin" class="remove-btn" @click.stop="removeCustomStyle(style.id)">x</span>
      </div>
      <div class="style-menu-divider"></div>
      <div class="style-menu-item" @click="handleFileImport">
        <span>Import CSS...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-selector {
  position: relative;
}

.style-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all 0.15s ease;
}

.style-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
}

.style-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 4px;
  min-width: 150px;
  z-index: 100;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.style-menu-item {
  padding: 6px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.12s ease;
}

.style-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.style-menu-item.active {
  color: #6c9bff;
  background: rgba(108, 155, 255, 0.08);
}

.style-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 4px 0;
}

.remove-btn {
  opacity: 0.4;
  font-size: 10px;
}

.remove-btn:hover {
  opacity: 1;
  color: #ff6b6b;
}

:global(.light) .style-btn {
  color: rgba(0, 0, 0, 0.4);
}

:global(.light) .style-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.7);
}

:global(.light) .style-menu {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

:global(.light) .style-menu-item {
  color: rgba(0, 0, 0, 0.6);
}

:global(.light) .style-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.9);
}

:global(.light) .style-menu-item.active {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.08);
}

:global(.light) .style-menu-divider {
  background: rgba(0, 0, 0, 0.06);
}
</style>
