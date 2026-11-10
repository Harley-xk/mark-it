<!--
  * 作者: Harley-xk
  * 创建: 2026-11-09
  *
  * 描述: 文档内搜索 / 替换的浮动面板
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { EditorView } from '@codemirror/view'
import { useSearchStore } from '../../stores/search'
import { useEditorStore } from '../../stores/editor'
import { findTextMatches } from '../../utils/search'

const search = useSearchStore()
const editor = useEditorStore()

const queryInput = ref<HTMLInputElement>()

const canReplace = computed(() => search.surface === 'editor')

const countText = computed(() => {
  if (search.query.length === 0) return ''
  if (search.total === 0) return '无结果'
  return `${search.index + 1}/${search.total}`
})

function focusQuery(): void {
  nextTick(() => {
    queryInput.value?.focus()
    queryInput.value?.select()
  })
}

onMounted(focusQuery)
watch(() => search.focusToken, focusQuery)

function onQueryKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) search.previous()
    else search.next()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    search.close()
  }
}

function onReplaceKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    replaceCurrent()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    search.close()
  }
}

function currentMatches(): {
  view: EditorView
  matches: ReturnType<typeof findTextMatches>
} | null {
  const view = editor.editorView
  if (!view) return null
  const matches = findTextMatches(view.state.doc.toString(), search.query, search.caseSensitive)
  return { view, matches }
}

function replaceCurrent(): void {
  if (!canReplace.value || search.total <= 0) return
  const current = currentMatches()
  if (!current) return

  const target = current.matches[search.index]
  if (!target) return

  const replacement = search.replaceText
  const caret = target.from + replacement.length
  current.view.dispatch({
    changes: { from: target.from, to: target.to, insert: replacement },
    selection: { anchor: caret },
    effects: EditorView.scrollIntoView(caret, { y: 'center' })
  })

  // 基于替换后的文档重新定位：跳到替换点之后的下一处匹配，没有则回到开头
  const remaining = findTextMatches(
    current.view.state.doc.toString(),
    search.query,
    search.caseSensitive
  )
  search.updateResult(remaining.length, false)
  const nextIndex = remaining.findIndex((match) => match.from >= caret)
  search.jumpTo(nextIndex >= 0 ? nextIndex : 0)
}

function replaceAll(): void {
  if (!canReplace.value) return
  const current = currentMatches()
  if (!current || current.matches.length === 0) {
    search.showHud('没有匹配项')
    return
  }

  current.view.dispatch({
    changes: current.matches.map((match) => ({
      from: match.from,
      to: match.to,
      insert: search.replaceText
    }))
  })
  search.showHud(`已替换 ${current.matches.length} 处`)
}
</script>

<template>
  <div class="search-panel" role="search">
    <div class="search-row">
      <input
        ref="queryInput"
        v-model="search.query"
        class="search-input"
        type="text"
        placeholder="查找"
        spellcheck="false"
        autocomplete="off"
        @keydown="onQueryKeydown"
      />
      <span class="search-count">{{ countText }}</span>
      <button
        class="sp-btn sp-case"
        :class="{ active: search.caseSensitive }"
        :title="search.caseSensitive ? '区分大小写（点击忽略）' : '忽略大小写（点击区分）'"
        @mousedown.prevent
        @click="search.toggleCaseSensitive"
      >
        Aa
      </button>
      <button
        v-if="canReplace"
        class="sp-btn"
        :class="{ active: search.showReplace }"
        title="显示替换 (Ctrl+H)"
        @mousedown.prevent
        @click="search.toggleReplace"
      >
        替换
      </button>
      <button
        class="sp-btn sp-icon"
        title="上一个 (Shift+Enter / Shift+F3)"
        @mousedown.prevent
        @click="search.previous"
      >
        ↑
      </button>
      <button
        class="sp-btn sp-icon"
        title="下一个 (Enter / F3)"
        @mousedown.prevent
        @click="search.next"
      >
        ↓
      </button>
      <button class="sp-btn sp-icon" title="关闭 (Esc)" @mousedown.prevent @click="search.close">
        ×
      </button>
    </div>

    <div v-if="canReplace && search.showReplace" class="search-row">
      <input
        v-model="search.replaceText"
        class="search-input"
        type="text"
        placeholder="替换为"
        spellcheck="false"
        autocomplete="off"
        @keydown="onReplaceKeydown"
      />
      <button
        class="sp-btn sp-action"
        title="替换当前项 (Enter)"
        @mousedown.prevent
        @click="replaceCurrent"
      >
        替换
      </button>
      <button class="sp-btn sp-action" title="全部替换" @mousedown.prevent @click="replaceAll">
        全部
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  position: absolute;
  top: 42px;
  right: 14px;
  z-index: 40;
  width: 380px;
  max-width: calc(100% - 28px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(30, 30, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.22);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.search-input:focus {
  border-color: rgba(108, 155, 255, 0.65);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.32);
}

.search-count {
  min-width: 44px;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
}

.sp-btn {
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.sp-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
}

.sp-btn.active {
  background: rgba(108, 155, 255, 0.22);
  color: #8fb5ff;
}

.sp-icon {
  font-size: 14px;
  padding: 0;
}

.sp-case {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sp-action {
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.06);
}

:global(.light .search-panel) {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.16);
}

:global(.light .search-input) {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.85);
}

:global(.light .search-input::placeholder) {
  color: rgba(0, 0, 0, 0.35);
}

:global(.light .search-count) {
  color: rgba(0, 0, 0, 0.45);
}

:global(.light .sp-btn) {
  color: rgba(0, 0, 0, 0.55);
}

:global(.light .sp-btn:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

:global(.light .sp-btn.active) {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
}

:global(.light .sp-action) {
  background: rgba(0, 0, 0, 0.04);
}
</style>
