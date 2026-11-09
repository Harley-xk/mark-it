<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import UpdateNotice from './components/update/UpdateNotice.vue'
import { useOutline } from './composables/useOutline'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useScrollbarState } from './composables/useScrollbarState'
import { useWindowZoom } from './composables/useWindowZoom'
import { useConfirmDialog, resolveConfirm } from './composables/useConfirmUnsaved'
import { useUpdateStore } from './stores/update'
import { useAppStore } from './stores/app'
import { useFile } from './composables/useFile'
import { useFileWatcher } from './composables/useFileWatcher'
import { useSession } from './composables/useSession'
import { saveAllBeforeExit } from './composables/useExitGuard'

useOutline()
useKeyboardShortcuts()
useScrollbarState()
useWindowZoom()
// 活跃标签的磁盘外部变更自动同步；非活跃标签在切换过去时刷新一次
useFileWatcher()
// 负责启动时恢复上次打开的文档，并在关闭/更新重启前保存会话
useSession()

const update = useUpdateStore()
update.init()
const app = useAppStore()
// 让原生外观跟随用户选择的主题：系统窗口按钮的 hover 对比色按 nativeTheme 计算，
// 不传的话浅色 UI 在深色系统下会拿到几乎不可见的白色 hover（system 模式保持跟随系统）
watch(
  () => app.themeMode,
  (mode) => {
    window.api.setNativeTheme(mode)
  },
  { immediate: true }
)
const file = useFile()
const {
  showConfirm,
  confirmTitle,
  confirmMessage,
  confirmSaveText,
  confirmDiscardText,
  confirmCancelText,
  confirmDiff
} = useConfirmDialog()

// macOS Cmd+W 被系统菜单占用，由主进程拦截后转交这里关闭标签页
const offCloseTabShortcut = window.api.onCloseTabShortcut(() => {
  file.closeTab()
})

// 监听窗口关闭请求：逐个检查所有标签页的未保存修改。
// quit 表示本次关闭来自退出应用（Cmd+Q / 菜单退出），保存完成后需要真正退出
const offCloseRequest = window.api.onCloseRequest(async ({ quit }) => {
  if (!(await saveAllBeforeExit('关闭窗口'))) return
  // 销毁 close 监听器后真正关闭
  await window.api.close(quit)
})

// 更新详情窗口请求安装：先处理未保存内容，再由主进程退出安装
const offInstallRequest = window.api.update.onInstallRequest(async () => {
  if (!(await saveAllBeforeExit('安装更新'))) return
  await update.install()
})

// HMR / 重复挂载时注销监听，避免同一事件被处理多次
onUnmounted(() => {
  offCloseTabShortcut()
  offCloseRequest()
  offInstallRequest()
  update.dispose()
})
</script>

<template>
  <AppLayout />
  <ConfirmDialog
    :visible="showConfirm"
    :title="confirmTitle"
    :message="confirmMessage"
    :save-text="confirmSaveText"
    :discard-text="confirmDiscardText"
    :cancel-text="confirmCancelText"
    :diff="confirmDiff"
    @save="resolveConfirm('save')"
    @discard="resolveConfirm('discard')"
    @cancel="resolveConfirm('cancel')"
  />
  <UpdateNotice />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family:
    'Segoe UI',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
}

body {
  background: transparent;
}

/* ── 预览区搜索高亮（CSS Custom Highlight API） ──
   只通过 CSS.highlights 注册 Range，不改写预览 DOM，避免与 v-html 重渲染冲突 */
::highlight(markit-search) {
  background-color: rgba(255, 193, 7, 0.3);
}

::highlight(markit-search-active) {
  background-color: rgba(255, 152, 0, 0.62);
}

.light ::highlight(markit-search) {
  background-color: rgba(255, 193, 7, 0.42);
}

.light ::highlight(markit-search-active) {
  background-color: rgba(255, 140, 0, 0.72);
}

/* 滚动条：固定 10px 始终占位。显隐只改滑块颜色、不改宽度，
   所以隐藏状态下容器尺寸与内容排版不变，不会因显隐反复重排。
   默认完全透明（隐藏），鼠标进入滚动容器或滚动时点亮，拖动时高亮（VS Code 风格）。
   悬停状态由 useScrollbarState 以 sb-active 类维护 —— CSS :hover 会在
   鼠标进入标题栏拖拽区等不派发事件的区域时卡住不消失 */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

/* 纵横滚动条交汇处的方块不跟随 track 的透明样式，默认按浅色主题绘制，
   深色模式下会露出一块白斑；显式置空与 track 保持一致 */
::-webkit-scrollbar-corner {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  /* 默认透明即「隐藏」，但仍占据 10px 槽位，避免显隐引起内容抖动 */
  background: transparent;
  border-radius: 5px;
  /* Chromium 的滑块最短只画 17px，超长文档里几乎点不中。
     竖向滑块由 min-height 兜底、横向滑块由 min-width 兜底，
     两个属性互不影响对方方向（实测横向滑块高度、竖向滑块宽度均不变） */
  min-height: 40px;
  min-width: 40px;
}

.sb-active::-webkit-scrollbar-thumb,
.sb-scrolling::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
}

.sb-active::-webkit-scrollbar-thumb:active {
  background: rgba(255, 255, 255, 0.5);
}

.light ::-webkit-scrollbar-thumb {
  background: transparent;
}

.light .sb-active::-webkit-scrollbar-thumb,
.light .sb-scrolling::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
}

.light .sb-active::-webkit-scrollbar-thumb:active {
  background: rgba(0, 0, 0, 0.5);
}

/* ── Mermaid 图表查看器（缩放 / 下载） ── */

.mermaid-diagram {
  position: relative;
}

.mermaid-viewport {
  display: flex;
  /* 图比容器窄时由 canvas 的 auto 外边距居中；超出时自动回落到左对齐，
     保证左侧内容可以滚动到（flex 的 justify-content: center 会裁掉左半部分） */
  justify-content: flex-start;
  max-height: 70vh;
  overflow: auto;
}

.mermaid-canvas {
  flex: 0 0 auto;
  margin: 0 auto;
}

.mermaid-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: rgba(30, 30, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  /* 默认隐藏，鼠标悬停或键盘聚焦到工具栏时显示 */
  opacity: 0;
  /* 隐藏时不拦截图表区域的点击，显示后再恢复交互 */
  pointer-events: none;
  transition: opacity 0.15s ease;
  user-select: none;
}

.mermaid-diagram:hover .mermaid-toolbar,
.mermaid-toolbar:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.mermaid-toolbar-btn {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 11px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.mermaid-toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.mermaid-icon-btn {
  padding: 0 4px;
}

.mermaid-icon-btn svg {
  display: block;
  flex-shrink: 0;
}

.mermaid-zoom-label {
  min-width: 42px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.55);
}

.light .mermaid-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.light .mermaid-toolbar-btn {
  color: rgba(0, 0, 0, 0.6);
}

.light .mermaid-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.light .mermaid-zoom-label {
  color: rgba(0, 0, 0, 0.5);
}

/* 预览正文基础默认值：:where 保持零优先级，主题与导入的 GitHub CSS 可以覆盖 */
:where(.preview-content) {
  color: #d4d4d8;
  line-height: 1.7;
}

:where(.light) :where(.preview-content) {
  color: #374151;
}

/* 预览背景由 .preview-container 统一提供：导入的 GitHub CSS 常给 .markdown-body
   设置实色背景，会在内容区形成与容器不一致的色块，这里只覆盖该元素自身的背景 */
.preview-content.markdown-body {
  background-color: transparent;
}

/* 代码块语法高亮：变量由全局提供，主题 CSS 可按需覆盖 */
.markdown-body {
  --hljs-keyword: #ff7b72;
  --hljs-string: #a5d6ff;
  --hljs-number: #79c0ff;
  --hljs-comment: #8b949e;
  --hljs-title: #d2a8ff;
  --hljs-built-in: #ffa657;
}

.light .markdown-body {
  --hljs-keyword: #cf222e;
  --hljs-string: #0a3069;
  --hljs-number: #0550ae;
  --hljs-comment: #6e7781;
  --hljs-title: #8250df;
  --hljs-built-in: #953800;
}

.markdown-body .hljs-comment,
.markdown-body .hljs-quote {
  color: var(--hljs-comment);
  font-style: italic;
}

.markdown-body .hljs-keyword,
.markdown-body .hljs-selector-tag,
.markdown-body .hljs-doctag,
.markdown-body .hljs-template-tag,
.markdown-body .hljs-template-variable {
  color: var(--hljs-keyword);
}

.markdown-body .hljs-string,
.markdown-body .hljs-regexp,
.markdown-body .hljs-meta .hljs-string {
  color: var(--hljs-string);
}

.markdown-body .hljs-number,
.markdown-body .hljs-literal,
.markdown-body .hljs-variable,
.markdown-body .hljs-attr,
.markdown-body .hljs-attribute,
.markdown-body .hljs-selector-attr,
.markdown-body .hljs-selector-class,
.markdown-body .hljs-selector-id {
  color: var(--hljs-number);
}

.markdown-body .hljs-title,
.markdown-body .hljs-section {
  color: var(--hljs-title);
  font-weight: 600;
}

.markdown-body .hljs-built_in,
.markdown-body .hljs-type,
.markdown-body .hljs-name,
.markdown-body .hljs-tag {
  color: var(--hljs-built-in);
}

.markdown-body .hljs-meta,
.markdown-body .hljs-symbol,
.markdown-body .hljs-bullet,
.markdown-body .hljs-link {
  color: var(--hljs-comment);
}

.markdown-body .hljs-emphasis {
  font-style: italic;
}

.markdown-body .hljs-strong {
  font-weight: 600;
}

/* ── YAML frontmatter 文档信息表 ── */

.preview-content .frontmatter-block {
  margin: 0 0 1.6em;
}

.preview-content .frontmatter-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
  user-select: none;
}

.preview-content .frontmatter-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  line-height: 1.6;
}

.preview-content .frontmatter-table th {
  padding: 8px 14px;
  text-align: left;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(108, 155, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-content .frontmatter-table td {
  padding: 8px 14px;
  vertical-align: top;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #d4d4d8;
}

.preview-content .frontmatter-table .fm-key {
  width: 160px;
  white-space: nowrap;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: #9db4ff;
}

.preview-content .frontmatter-table .fm-value {
  white-space: pre-wrap;
  word-break: break-word;
}

.light .preview-content .frontmatter-title {
  color: rgba(0, 0, 0, 0.45);
}

.light .preview-content .frontmatter-table th {
  color: rgba(0, 0, 0, 0.62);
  background: rgba(59, 130, 246, 0.06);
  border-color: rgba(0, 0, 0, 0.08);
}

.light .preview-content .frontmatter-table td {
  color: #374151;
  border-color: rgba(0, 0, 0, 0.08);
}

.light .preview-content .frontmatter-table .fm-key {
  color: #3b5bdb;
}

/* 图表渲染失败的提示（原始代码块仍保留在上方） */
.preview-content .mermaid-error {
  margin: 8px 0 1.2em;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #d97706;
  background: rgba(217, 119, 6, 0.08);
  border: 1px solid rgba(217, 119, 6, 0.25);
  white-space: pre-wrap;
  word-break: break-word;
}

.light .preview-content .mermaid-error {
  color: #b45309;
  background: rgba(180, 83, 9, 0.06);
  border-color: rgba(180, 83, 9, 0.2);
}
</style>
