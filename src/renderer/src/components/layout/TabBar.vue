<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDocumentsStore } from '../../stores/documents'
import { useFile } from '../../composables/useFile'
import { useAppStore } from '../../stores/app'
import { findInsertBefore } from '../../utils/tab-order'
import type { EditorWindowSummary } from '../../../../shared/window-types'

const docs = useDocumentsStore()
const app = useAppStore()
const file = useFile()

const scrollRef = ref<HTMLDivElement>()

/** 鼠标滚轮纵向滚动时，横向翻动标签栏 */
function onWheel(e: WheelEvent): void {
  const el = scrollRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

/**
 * 把激活的标签滚到可视区域内。
 * 自己算左右边界而不用 scrollIntoView：标题栏整体不可滚动，
 * 只应该翻动标签条本身。
 */
function revealActiveTab(): void {
  const el = scrollRef.value
  const tab = el?.querySelector<HTMLElement>('.tab.active')
  if (!el || !tab) return

  const margin = 6
  const container = el.getBoundingClientRect()
  const rect = tab.getBoundingClientRect()
  if (rect.left < container.left) {
    el.scrollLeft -= container.left - rect.left + margin
  } else if (rect.right > container.right) {
    el.scrollLeft += rect.right - container.right + margin
  }
}

// ── 标签拖拽排序 ──

const dragTabId = ref<string | null>(null)
const dropBefore = ref<number | null>(null)
let dragging = false
let suppressClickUntil = 0
let autoScrollFrame: number | null = null
let dragClientX = 0
let dropHandled = false

const draggingIndex = computed(() =>
  dragTabId.value ? docs.docs.findIndex((doc) => doc.id === dragTabId.value) : -1
)

/** 移动后位置不变的间隙不显示插入指示线 */
const dropIndicatorIndex = computed(() => {
  const before = dropBefore.value
  const from = draggingIndex.value
  if (before === null || from === -1) return null
  if (before === from || before === from + 1) return null
  return before
})

function tabElements(): HTMLElement[] {
  return Array.from(scrollRef.value?.querySelectorAll<HTMLElement>('.tab') ?? [])
}

function updateDropBefore(clientX: number): void {
  const tabs = tabElements()
  const from = tabs.findIndex((tab) => tab.dataset.docId === dragTabId.value)
  if (from === -1) return

  const rects = tabs.map((tab) => {
    const rect = tab.getBoundingClientRect()
    return { left: rect.left, width: rect.width }
  })
  dropBefore.value = findInsertBefore(rects, clientX, from)
}

function stopAutoScroll(): void {
  if (autoScrollFrame !== null) {
    cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = null
  }
}

function autoScrollStep(): void {
  autoScrollFrame = null
  if (!dragging || !scrollRef.value) return

  const el = scrollRef.value
  const rect = el.getBoundingClientRect()
  const edge = 24
  let delta = 0
  if (dragClientX < rect.left + edge) delta = -8
  else if (dragClientX > rect.right - edge) delta = 8
  if (delta === 0) return

  // 到达可滚动边界后停止，避免空转
  const previous = el.scrollLeft
  el.scrollLeft += delta
  if (el.scrollLeft === previous) return

  updateDropBefore(dragClientX)
  autoScrollFrame = requestAnimationFrame(autoScrollStep)
}

function updateAutoScroll(): void {
  if (!dragging || !scrollRef.value) return

  const el = scrollRef.value
  const rect = el.getBoundingClientRect()
  const edge = 24
  const nearEdge = dragClientX < rect.left + edge || dragClientX > rect.right - edge
  if (!nearEdge) {
    stopAutoScroll()
    return
  }
  if (autoScrollFrame === null) {
    autoScrollFrame = requestAnimationFrame(autoScrollStep)
  }
}

function onDragStart(id: string, e: DragEvent): void {
  const target = e.target as HTMLElement | null
  // 从关闭按钮起手时拖动整个标签会误触，直接放弃本次拖拽
  if (target?.closest('.tab-close')) {
    e.preventDefault()
    return
  }
  if (!e.dataTransfer) return

  dragging = true
  dropHandled = false
  dragTabId.value = id
  dropBefore.value = null
  dragClientX = e.clientX
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', id)

  const el = e.currentTarget as HTMLElement
  e.dataTransfer.setDragImage(el, 20, el.offsetHeight / 2)
}

function onDragOver(e: DragEvent): void {
  if (!dragTabId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragClientX = e.clientX
  updateDropBefore(e.clientX)
  updateAutoScroll()
}

function resetDrag(): void {
  dragging = false
  dragTabId.value = null
  dropBefore.value = null
  stopAutoScroll()
}

function onDrop(e: DragEvent): void {
  if (!dragTabId.value) return
  e.preventDefault()

  const id = dragTabId.value
  const before = dropBefore.value
  dropHandled = true
  resetDrag()
  // 抑制拖拽结束后紧随其后的 click，避免把拖拽误判为激活标签
  suppressClickUntil = Date.now() + 50
  if (before === null) return

  docs.moveDocument(id, before)
  void nextTick(revealActiveTab)
}

async function onDragEnd(): Promise<void> {
  const id = dragTabId.value
  const wasDropped = dropHandled
  resetDrag()
  dropHandled = false
  suppressClickUntil = Date.now() + 50
  if (!id || wasDropped) return

  const point = await window.api.getCursorScreenPoint()
  if (!point) return
  const inside =
    point.x >= window.screenX &&
    point.x <= window.screenX + window.outerWidth &&
    point.y >= window.screenY &&
    point.y <= window.screenY + window.outerHeight
  if (!inside) await file.moveTabToTargetWindow(id)
}

function onTabClick(id: string, e: MouseEvent): void {
  if (dragging || Date.now() < suppressClickUntil) {
    e.preventDefault()
    return
  }
  docs.activateDocument(id)
}

// 激活的标签滚动到可视区域内（标签增删后也重新对齐）
watch(
  () => [docs.activeId, docs.docs.length] as const,
  async () => {
    await nextTick()
    revealActiveTab()
  }
)

function onMiddleClick(id: string, e: MouseEvent): void {
  if (e.button !== 1) return
  e.preventDefault()
  file.closeTab(id)
}

// ── 标签右键菜单（关闭 / 关闭其他 / 关闭左侧 / 关闭右侧） ──

const menuVisible = ref(false)
const menuTabId = ref('')
const menuX = ref(0)
const menuY = ref(0)
const menuRef = ref<HTMLDivElement>()
const otherWindows = ref<EditorWindowSummary[]>([])

const menuIndex = computed(() => docs.docs.findIndex((doc) => doc.id === menuTabId.value))
const canCloseOthers = computed(() => docs.docs.length > 1)
const canCloseLeft = computed(() => menuIndex.value > 0)
const canCloseRight = computed(() => menuIndex.value >= 0 && menuIndex.value < docs.docs.length - 1)

function openContextMenu(id: string, e: MouseEvent): void {
  e.preventDefault()
  menuTabId.value = id
  menuX.value = e.clientX
  menuY.value = e.clientY
  otherWindows.value = []
  menuVisible.value = true
  void nextTick(clampMenuIntoViewport)
  void window.api.listEditorWindows().then((windows) => {
    if (!menuVisible.value || menuTabId.value !== id) return
    otherWindows.value = windows
    void nextTick(clampMenuIntoViewport)
  })
}

/** 菜单贴近窗口边缘时向内收，避免被裁掉 */
function clampMenuIntoViewport(): void {
  const el = menuRef.value
  if (!el) return
  const margin = 6
  const rect = el.getBoundingClientRect()
  menuX.value = Math.max(margin, Math.min(menuX.value, window.innerWidth - rect.width - margin))
  menuY.value = Math.max(margin, Math.min(menuY.value, window.innerHeight - rect.height - margin))
}

type CloseMenuAction = 'window' | 'self' | 'others' | 'left' | 'right'

function moveToWindow(targetWindowId: string): void {
  const id = menuTabId.value
  closeMenu()
  if (!id) return
  void file.moveTabToWindow(targetWindowId, id)
}

function moveAllToWindow(targetWindowId: string): void {
  closeMenu()
  void file.moveAllTabsToWindow(targetWindowId)
}

function runMenuAction(action: CloseMenuAction): void {
  const id = menuTabId.value
  const index = docs.docs.findIndex((doc) => doc.id === id)
  closeMenu()
  if (index === -1) return

  if (action === 'window') {
    void file.moveTabToNewWindow(id)
    return
  }

  if (action === 'self') {
    void file.closeTab(id)
    return
  }

  const ids = docs.docs
    .filter((_doc, i) =>
      action === 'others' ? i !== index : action === 'left' ? i < index : i > index
    )
    .map((doc) => doc.id)
  if (ids.length === 0) return
  void file.closeTabs(ids, id)
}

function closeMenu(): void {
  menuVisible.value = false
}

function onDocumentMousedown(e: MouseEvent): void {
  if (!menuVisible.value) return
  if (menuRef.value && e.target instanceof Node && menuRef.value.contains(e.target)) return
  closeMenu()
}

function onDocumentKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && menuVisible.value) closeMenu()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown, true)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('blur', closeMenu)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('blur', closeMenu)
  window.removeEventListener('resize', closeMenu)
})
</script>

<template>
  <div class="tab-bar">
    <div ref="scrollRef" class="tab-scroll" @wheel="onWheel" @dragover="onDragOver" @drop="onDrop">
      <div
        v-for="(doc, index) in docs.docs"
        :key="doc.id"
        class="tab"
        :class="{
          active: doc.id === docs.activeId,
          modified: doc.isModified,
          dragging: dragTabId === doc.id,
          'drop-before': dropIndicatorIndex === index,
          'drop-after': dropIndicatorIndex === docs.docs.length && index === docs.docs.length - 1
        }"
        :title="doc.path || doc.name"
        :data-doc-id="doc.id"
        draggable="true"
        @click="onTabClick(doc.id, $event)"
        @dragstart="onDragStart(doc.id, $event)"
        @dragend="onDragEnd"
        @mousedown="onMiddleClick(doc.id, $event)"
        @contextmenu="openContextMenu(doc.id, $event)"
      >
        <span class="tab-name">{{ doc.name }}</span>
        <span v-if="doc.isModified" class="tab-dot" title="未保存"></span>
        <button
          class="tab-close"
          draggable="false"
          title="关闭标签页 (Ctrl+W)"
          @dragstart.stop.prevent
          @click.stop="file.closeTab(doc.id)"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <button
        class="tab-new"
        draggable="false"
        title="新建 (Ctrl+N)"
        @dragstart.stop.prevent
        @click="file.newFile()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- 标签右侧留白用于拖动窗口 -->
    <div class="drag-space"></div>
  </div>

  <!-- 右键菜单挂到 body：标题栏处于可拖动区域，菜单需要独立定位 -->
  <Teleport to="body">
    <div
      v-if="menuVisible"
      ref="menuRef"
      class="tab-context-menu"
      :class="{ light: app.resolvedTheme === 'light' }"
      :style="{ left: `${menuX}px`, top: `${menuY}px` }"
      role="menu"
    >
      <button class="ctx-item" role="menuitem" @click="runMenuAction('window')">
        在新窗口中打开
      </button>
      <template v-if="otherWindows.length > 0">
        <div class="ctx-separator"></div>
        <div class="ctx-label">移动到其他窗口</div>
        <button
          v-for="windowItem in otherWindows"
          :key="windowItem.id"
          class="ctx-item"
          role="menuitem"
          @click="moveToWindow(windowItem.id)"
        >
          {{ windowItem.title }}
        </button>
        <div class="ctx-separator"></div>
        <div class="ctx-label">全部标签</div>
        <button
          v-for="windowItem in otherWindows"
          :key="`all-${windowItem.id}`"
          class="ctx-item"
          role="menuitem"
          @click="moveAllToWindow(windowItem.id)"
        >
          全部移动到 {{ windowItem.title }}
        </button>
      </template>
      <div class="ctx-separator"></div>
      <button class="ctx-item" role="menuitem" @click="runMenuAction('self')">关闭</button>
      <button
        class="ctx-item"
        role="menuitem"
        :disabled="!canCloseOthers"
        @click="runMenuAction('others')"
      >
        关闭其他
      </button>
      <div class="ctx-separator"></div>
      <button
        class="ctx-item"
        role="menuitem"
        :disabled="!canCloseLeft"
        @click="runMenuAction('left')"
      >
        关闭左侧
      </button>
      <button
        class="ctx-item"
        role="menuitem"
        :disabled="!canCloseRight"
        @click="runMenuAction('right')"
      >
        关闭右侧
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.tab-bar {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.tab-scroll {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.tab-scroll::-webkit-scrollbar {
  display: none;
}

.drag-space {
  flex: 1;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

/* Chrome 风格标签：顶部圆角、贴住标题栏底部 */
.tab {
  flex: 0 0 auto;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-width: 100px;
  max-width: 200px;
  margin: 0 1px;
  padding: 0 30px 0 12px;
  border-radius: 8px 8px 0 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: default;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.85);
}

.tab.active {
  background: rgba(255, 255, 255, 0.11);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.tab.dragging {
  opacity: 0.45;
  cursor: grabbing;
}

.tab.drop-before::before,
.tab.drop-after::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  z-index: 1;
  width: 2px;
  border-radius: 1px;
  background: #6c9bff;
  pointer-events: none;
}

.tab.drop-before::before {
  left: -2px;
}

.tab.drop-after::after {
  right: -2px;
}

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c9bff;
}

.tab-close {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    background 0.12s ease;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.tab-new {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  /* 与标签底部对齐，悬停背景与标签齐平 */
  margin: 0 6px 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tab-new:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

/* ── 标签右键菜单 ── */

.tab-context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 148px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  background: rgba(30, 30, 42, 0.98);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  user-select: none;
  -webkit-app-region: no-drag;
}

.ctx-item {
  display: block;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 30px;
  text-align: left;
  cursor: default;
  transition:
    background 0.1s ease,
    color 0.1s ease;
}

.ctx-label {
  padding: 4px 10px 3px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.ctx-item:hover:not(:disabled) {
  background: rgba(108, 155, 255, 0.18);
  color: #fff;
}

.ctx-item:disabled {
  color: rgba(255, 255, 255, 0.3);
}

.ctx-separator {
  height: 1px;
  margin: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
}

.tab-context-menu.light {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
}

.tab-context-menu.light .ctx-item {
  color: rgba(0, 0, 0, 0.75);
}

.tab-context-menu.light .ctx-label {
  color: rgba(0, 0, 0, 0.38);
}

.tab-context-menu.light .ctx-item:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  color: #1a1a2e;
}

.tab-context-menu.light .ctx-item:disabled {
  color: rgba(0, 0, 0, 0.28);
}

.tab-context-menu.light .ctx-separator {
  background: rgba(0, 0, 0, 0.07);
}
</style>
