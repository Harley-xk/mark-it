import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EditorState } from '@codemirror/state'
import type { HeadingItem, LayoutMode } from '../types'
import type { SessionTab } from '../../../shared/session-types'
import type { FileTextEncoding } from '../../../shared/file-types'
import { normalizePath } from '../utils/path'
import { isLayoutMode, loadSavedLayoutMode } from '../utils/layout-mode'
import { loadSavedOutlineVisible } from '../utils/outline-visibility'
import { moveItem } from '../utils/tab-order'
import { decodeText, normalizeToLf, type LineEnding } from '../utils/text-encoding'
import {
  PLAIN_TEXT_BYTES,
  PREVIEW_DEGRADE_BYTES,
  applyDocumentSize,
  selectDocumentMode,
  utf8ByteLength,
  type DocumentMode
} from '../utils/document-mode'
import { manualContent } from '../utils/manual'
import { useI18n } from '../i18n'

export interface DocumentTab {
  id: string
  /** 跨会话稳定的编辑历史标识；与运行期标签 id 分离 */
  historyId: string
  path: string | null
  name: string
  /** 编辑器内部内容，统一使用 LF 换行 */
  content: string
  /** 最近一次从磁盘载入 / 保存后的内容（LF），用于判断磁盘是否真的发生了变化 */
  diskContent: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  wordCount: number
  headings: HeadingItem[]
  /** 原文件换行符；保存时按此还原，避免整文件行尾 diff */
  eol: LineEnding
  /** 原文件是否带 UTF-8 BOM；保存时按此还原 */
  bom: boolean
  /** 只读（非 UTF-8 编码或超过大小阈值）：编辑器禁止输入，保存只能另存为 */
  readOnly: boolean
  /** 原文件编码；用于状态栏与只读提示 */
  encoding: FileTextEncoding
  /** 是否因过大而不把正文写入会话快照 */
  excludedFromSession: boolean
  /** 文件字节数；未保存文档按 UTF-8 编码后的字节数 */
  size: number
  /** 能力模式：大小只决定降级，不影响编辑与保存 */
  mode: DocumentMode
  /** 用户显式要求在大文件模式下渲染预览；仅本次会话有效 */
  previewOverride: boolean
  /** 预览是否因内容增长被自动暂停（用于区分提示文案） */
  previewAutoPaused: boolean
  /** 编辑中跨过纯文本阈值，等待用户确认切换 */
  plainSuggested: boolean
  /** 用户已拒绝切换纯文本模式；内容缩小到阈值以下前不再提示 */
  plainPromptDismissed: boolean
  /** 磁盘文件是否已不存在 */
  missing: boolean
  /** 当前标签的布局模式；切换标签时由 app.layoutMode 读取 */
  layoutMode: LayoutMode
  /** 当前标签的大纲显隐；切换标签时由 app.showOutline 读取 */
  outlineVisible: boolean
}

/** 从主进程读取结果带入的磁盘文件状态 */
export interface DocumentFileMeta {
  eol?: LineEnding
  bom?: boolean
  readOnly?: boolean
  encoding?: FileTextEncoding
  excludedFromSession?: boolean
  size?: number
  missing?: boolean
}

export interface ScrollPosition {
  /** 像素滚动位置（兜底） */
  top: number
  /** 顶部可见行在文档中的起始偏移（切换标签后按此精确定位） */
  anchor: number
}

export interface PreviewScrollPosition {
  /** 像素滚动位置（兜底） */
  top: number
  /** 视口顶部所在的 .preview-content 直接子元素下标；-1 表示未记录（旧会话），恢复时退回像素 */
  anchor: number
  /** 视口顶部相对锚点元素顶部的偏移（像素，向下为正） */
  offset: number
}

let docSequence = 0

function nextDocId(): string {
  docSequence += 1
  return `doc-${docSequence}`
}

function baseName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || 'untitled.md'
}

function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

/** 会话里的滚动位置：允许 0，负数 / 非数字 / 非有限值一律按 0 处理 */
function scrollAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** 相对锚点元素的偏移：允许负数（锚点元素顶端位于视口下方），非法值按 0 处理 */
function scrollOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** 预览锚点下标；-1 表示没有记录（旧会话），恢复时退回像素 */
function previewAnchor(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : -1
}

export const useDocumentsStore = defineStore('documents', () => {
  const { locale, t } = useI18n()
  const docs = ref<DocumentTab[]>([])
  const activeId = ref('')

  // CodeMirror 的 EditorState 体积大且不可序列化，放在响应式系统之外，
  // 用于保留每个标签的撤销历史、选区与滚动位置
  const editorStates = new Map<string, EditorState>()
  /** 跨窗口迁移时的序列化 EditorState；首次挂载后取出并转为运行期 EditorState */
  const serializedEditorStates = new Map<string, unknown>()
  const scrollPositions = new Map<string, ScrollPosition>()
  // 预览区与编辑区是两套独立的滚动容器，各自记录内容锚点
  const previewScrollPositions = new Map<string, PreviewScrollPosition>()

  const activeDoc = computed<DocumentTab | null>(
    () => docs.value.find((d) => d.id === activeId.value) ?? null
  )

  function uniqueUntitledName(): string {
    const names = new Set(docs.value.map((d) => d.name))
    if (!names.has('untitled.md')) return 'untitled.md'
    let index = 2
    while (names.has(`untitled-${index}.md`)) index += 1
    return `untitled-${index}.md`
  }

  /** 新标签默认继承当前激活标签的布局；没有激活标签时回退到最近一次使用的布局 */
  function defaultTabLayoutMode(): LayoutMode {
    const active = docs.value.find((d) => d.id === activeId.value)
    return active?.layoutMode ?? loadSavedLayoutMode()
  }

  /** 新标签默认继承当前激活标签的大纲显隐；没有激活标签时回退到最近一次使用的值 */
  function defaultTabOutlineVisible(): boolean {
    const active = docs.value.find((d) => d.id === activeId.value)
    return active?.outlineVisible ?? loadSavedOutlineVisible()
  }

  function createTab(
    path: string | null,
    content: string,
    name?: string,
    meta?: DocumentFileMeta & {
      historyId?: string
      layoutMode?: LayoutMode
      outlineVisible?: boolean
    }
  ): DocumentTab {
    // 编辑器内部统一使用 LF；原文件的换行符与 BOM 记在标签上，保存时还原
    const decoded = decodeText(content)
    const text = decoded.text
    const size = meta?.size ?? utf8ByteLength(text)
    return {
      id: nextDocId(),
      historyId: meta?.historyId ?? crypto.randomUUID(),
      path,
      name: name || (path ? baseName(path) : uniqueUntitledName()),
      content: text,
      diskContent: text,
      isModified: false,
      cursorLine: 1,
      cursorCol: 1,
      wordCount: countWords(text),
      headings: [],
      eol: meta?.eol ?? decoded.eol,
      bom: meta?.bom ?? decoded.bom,
      readOnly: meta?.readOnly ?? false,
      encoding: meta?.encoding ?? (decoded.bom ? 'utf-8-bom' : 'utf-8'),
      excludedFromSession: meta?.excludedFromSession ?? false,
      size,
      // 打开时按磁盘字节数确定模式；之后的内容增长遵循 6.2 的降级规则
      mode: selectDocumentMode({ bytes: size }),
      previewOverride: false,
      previewAutoPaused: false,
      plainSuggested: false,
      plainPromptDismissed: false,
      missing: meta?.missing ?? false,
      layoutMode: meta?.layoutMode ?? defaultTabLayoutMode(),
      outlineVisible: meta?.outlineVisible ?? defaultTabOutlineVisible()
    }
  }

  /** 更新字节数并按阈值推进能力模式（状态迁移由纯函数维护） */
  function applySize(doc: DocumentTab, size: number): void {
    if (!Number.isFinite(size) || size < 0) return
    doc.size = size
    applyDocumentSize(doc, size)
  }

  /** 用主进程读取结果刷新标签的磁盘状态（不改写内容） */
  function applyFileMeta(doc: DocumentTab, meta: DocumentFileMeta): void {
    if (meta.readOnly !== undefined) doc.readOnly = meta.readOnly
    if (meta.encoding !== undefined) doc.encoding = meta.encoding
    if (meta.excludedFromSession !== undefined) doc.excludedFromSession = meta.excludedFromSession
    if (meta.size !== undefined) applySize(doc, meta.size)
    if (meta.missing !== undefined) doc.missing = meta.missing
  }

  function addDocument(
    path: string | null,
    content: string,
    name?: string,
    meta?: DocumentFileMeta
  ): DocumentTab {
    const doc = createTab(path, content, name, meta)
    docs.value.push(doc)
    activeId.value = doc.id
    return doc
  }

  /**
   * 启动时的默认占位标签（欢迎页或未编辑的空白页）。
   * 打开文件时可以直接替换它，避免额外留下一个 untitled 标签
   */
  function isPlaceholderTab(doc: DocumentTab): boolean {
    return doc.path === null && !doc.isModified
  }

  /** 打开磁盘文件：已打开过则直接激活对应标签，避免重复标签 */
  function openPathDocument(
    filePath: string,
    content: string,
    meta?: DocumentFileMeta
  ): DocumentTab {
    const normalized = normalizePath(filePath)
    const existing = docs.value.find((d) => d.path !== null && normalizePath(d.path) === normalized)
    if (existing) {
      if (meta) applyFileMeta(existing, meta)
      activeId.value = existing.id
      return existing
    }
    // 只有占位标签时直接替换，而不是在其旁边新建标签
    if (docs.value.length === 1 && isPlaceholderTab(docs.value[0])) {
      removeDocument(0)
    }
    return addDocument(filePath, content, undefined, meta)
  }

  function newDocument(content = '', filePath: string | null = null): DocumentTab {
    return addDocument(filePath, content)
  }

  function createRestoredTab(tab: SessionTab): DocumentTab {
    // 会话文件可能来自旧版本或被手工改坏：逐字段兜底，避免恢复时崩溃
    const path = typeof tab.path === 'string' && tab.path.length > 0 ? tab.path : null
    const content = typeof tab.content === 'string' ? tab.content : ''
    const name = typeof tab.name === 'string' && tab.name.length > 0 ? tab.name : undefined
    // 旧会话没有 layoutMode，按最近一次使用的布局兜底
    const layoutMode = isLayoutMode(tab.layoutMode) ? tab.layoutMode : loadSavedLayoutMode()
    // 旧会话没有 outlineVisible，按最近一次使用的大纲显隐兜底
    const outlineVisible =
      typeof tab.outlineVisible === 'boolean' ? tab.outlineVisible : loadSavedOutlineVisible()
    const doc = createTab(path, content, name, {
      historyId: tab.historyId,
      eol: tab.eol,
      bom: tab.bom,
      readOnly: tab.readOnly === true,
      encoding: tab.encoding,
      excludedFromSession: tab.excludedFromSession === true,
      // 旧会话没有 size 时按正文 UTF-8 字节数兜底；排除正文的标签由磁盘读取结果覆盖
      size: typeof tab.size === 'number' && Number.isFinite(tab.size) ? tab.size : undefined,
      missing: tab.missing === true,
      layoutMode,
      outlineVisible
    })
    doc.isModified = tab.isModified === true
    doc.cursorLine = typeof tab.cursorLine === 'number' && tab.cursorLine > 0 ? tab.cursorLine : 1
    doc.cursorCol = typeof tab.cursorCol === 'number' && tab.cursorCol > 0 ? tab.cursorCol : 1
    // 预填滚动缓存：标签首次挂载 / 激活时 restoreScroll 会读取这里
    scrollPositions.set(doc.id, {
      top: scrollAmount(tab.scrollTop),
      anchor: scrollAmount(tab.scrollAnchor)
    })
    previewScrollPositions.set(doc.id, {
      top: scrollAmount(tab.previewScrollTop),
      // 旧会话没有锚点：-1 让恢复逻辑退回像素位置
      anchor: previewAnchor(tab.previewScrollAnchor),
      offset: scrollOffset(tab.previewScrollOffset)
    })
    return doc
  }

  /**
   * 用上次会话的标签页替换当前内容（更新重启后恢复）。
   * 返回 false 表示会话为空、保持现有标签页不变
   */
  function restoreSession(
    tabs: SessionTab[],
    activeIndex: number,
    serializedStates?: ReadonlyMap<number, unknown>
  ): boolean {
    if (tabs.length === 0) return false

    editorStates.clear()
    serializedEditorStates.clear()
    scrollPositions.clear()
    previewScrollPositions.clear()

    const restored = tabs.map((tab, index) => {
      const doc = createRestoredTab(tab)
      const serialized = serializedStates?.get(index)
      if (serialized) serializedEditorStates.set(doc.id, serialized)
      return doc
    })

    docs.value = restored
    const index = Math.min(Math.max(Math.floor(activeIndex) || 0, 0), restored.length - 1)
    activeId.value = restored[index].id
    return true
  }

  /** 接收另一个编辑窗口迁入的标签，并保留其序列化 EditorState */
  function insertSessionTab(tab: SessionTab, serializedState?: unknown): DocumentTab {
    const doc = createRestoredTab(tab)
    if (serializedState) serializedEditorStates.set(doc.id, serializedState)
    docs.value.push(doc)
    activeId.value = doc.id
    return doc
  }

  function getDoc(id: string): DocumentTab | null {
    return docs.value.find((d) => d.id === id) ?? null
  }

  function activateDocument(id: string): void {
    if (docs.value.some((d) => d.id === id)) {
      activeId.value = id
    }
  }

  /** 移除指定下标的标签并清理其缓存状态 */
  function removeDocument(index: number): void {
    const [removed] = docs.value.splice(index, 1)
    if (!removed) return
    editorStates.delete(removed.id)
    serializedEditorStates.delete(removed.id)
    scrollPositions.delete(removed.id)
    previewScrollPositions.delete(removed.id)
  }

  function closeDocument(id: string): void {
    const index = docs.value.findIndex((d) => d.id === id)
    if (index === -1) return

    const wasActive = activeId.value === id
    removeDocument(index)

    if (docs.value.length === 0) {
      // 最后一个标签已关闭：由调用方（useFile.closeTab）关闭当前编辑窗口
      activeId.value = ''
      return
    }

    if (wasActive) {
      const next = docs.value[Math.min(index, docs.value.length - 1)]
      activeId.value = next.id
    }
  }

  function cycleDocument(delta: number): void {
    if (docs.value.length < 2) return
    const index = docs.value.findIndex((d) => d.id === activeId.value)
    if (index === -1) return
    const length = docs.value.length
    activeId.value = docs.value[(index + delta + length) % length].id
  }

  /**
   * 把指定标签移动到 insertBefore 指定的间隙（移动前数组的下标语义）。
   * 排序只改变顺序，不触碰内容、光标、EditorState 缓存或激活标签。
   */
  function moveDocument(id: string, insertBefore: number): void {
    const from = docs.value.findIndex((doc) => doc.id === id)
    if (from === -1) return

    const next = moveItem(docs.value, from, insertBefore)
    if (next.every((doc, index) => doc === docs.value[index])) return
    docs.value = next
  }

  /** 写入编辑器内容；返回实际存入 store 的字符串，调用方据此识别自身写入 */
  function updateContent(id: string, content: string): string {
    const doc = getDoc(id)
    if (!doc) return content
    const normalized = normalizeToLf(content)
    if (doc.content === normalized) return normalized
    doc.content = normalized
    doc.isModified = true
    // 纯文本模式下跳过全文扫描：字数与字节数都不再实时维护
    if (doc.mode === 'plain') return normalized
    applySize(doc, utf8ByteLength(normalized))
    doc.wordCount = countWords(normalized)
    return normalized
  }

  /** 从磁盘载入内容（刷新 / 外部加载），不标记为已修改 */
  function replaceContent(id: string, content: string, meta?: DocumentFileMeta): void {
    const doc = getDoc(id)
    if (!doc) return
    // 磁盘内容可能是 CRLF / 带 BOM：统一为 LF 保存内部内容，并同步原文件的行尾策略
    const decoded = decodeText(content)
    doc.content = decoded.text
    doc.diskContent = decoded.text
    doc.eol = meta?.eol ?? decoded.eol
    doc.bom = meta?.bom ?? decoded.bom
    doc.isModified = false
    if (meta) applyFileMeta(doc, { missing: false, ...meta })
    // 主进程返回的 size 是磁盘真实字节数；缺失时按内部文本估算
    if (meta?.size === undefined) applySize(doc, utf8ByteLength(decoded.text))
    if (doc.mode !== 'plain') doc.wordCount = countWords(decoded.text)
    // 缓存的 EditorState 仍是旧内容；继续使用会让重新激活的标签显示过期文本
    editorStates.delete(id)
    serializedEditorStates.delete(id)
  }

  function setCursor(id: string, line: number, col: number): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.cursorLine = line
    doc.cursorCol = col
  }

  function setHeadings(id: string, headings: HeadingItem[]): void {
    const doc = getDoc(id)
    if (doc) doc.headings = headings
  }

  /** 设置某个标签的布局模式；不影响其他标签 */
  function setLayoutMode(id: string, mode: LayoutMode): void {
    const doc = getDoc(id)
    if (doc) doc.layoutMode = mode
  }

  /** 设置某个标签的大纲显隐；不影响其他标签 */
  function setOutlineVisible(id: string, visible: boolean): void {
    const doc = getDoc(id)
    if (doc) doc.outlineVisible = visible
  }

  /**
   * 保存成功后调用；传入路径表示另存为。
   * `savedContent` 是本次实际写入的内容：异步写盘期间用户继续输入时，
   * 用它区分「已落盘版本」与「当前编辑内容」，避免误判为已保存。
   */
  function markSaved(
    id: string,
    filePath?: string,
    meta?: { excludedFromSession?: boolean; size?: number },
    savedContent?: string
  ): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.diskContent = savedContent ?? doc.content
    doc.isModified = doc.content !== doc.diskContent
    doc.missing = false
    doc.readOnly = false
    doc.encoding = doc.bom ? 'utf-8-bom' : 'utf-8'
    // 写盘后文件为 UTF-8，字节数可直接使用写入结果；
    // 若保存期间内容继续变化，则保留更新时已计算的字节数
    if (doc.content === doc.diskContent) {
      applySize(doc, meta?.size ?? utf8ByteLength(doc.content))
    }
    if (meta?.excludedFromSession !== undefined) {
      doc.excludedFromSession = meta.excludedFromSession
    }
    if (filePath) {
      doc.path = filePath
      doc.name = baseName(filePath)
    }
  }

  /** 大文件模式下用户显式要求渲染预览；纯文本模式需先恢复 Markdown 模式 */
  function setPreviewOverride(id: string, override: boolean): void {
    const doc = getDoc(id)
    if (!doc || doc.mode === 'plain') return
    doc.previewOverride = override
    if (override) doc.previewAutoPaused = false
  }

  /** 用户确认把编辑中的文档切换为纯文本模式 */
  function switchToPlainMode(id: string): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.mode = 'plain'
    doc.previewOverride = false
    doc.previewAutoPaused = false
    doc.plainSuggested = false
    doc.plainPromptDismissed = true
    doc.headings = []
  }

  /** 用户拒绝切换纯文本模式：内容缩小到阈值以下前不再提示 */
  function dismissPlainSuggestion(id: string): void {
    const doc = getDoc(id)
    if (!doc) return
    doc.plainSuggested = false
    doc.plainPromptDismissed = true
  }

  /** 从纯文本模式恢复 Markdown 能力；大文件仍需用户显式点击「仍要渲染预览」 */
  function restoreMarkdownMode(id: string): void {
    const doc = getDoc(id)
    if (!doc || doc.mode !== 'plain') return
    const size = utf8ByteLength(doc.content)
    doc.size = size
    doc.mode = size > PREVIEW_DEGRADE_BYTES ? 'large' : 'normal'
    doc.previewOverride = false
    doc.previewAutoPaused = false
    doc.plainSuggested = false
    doc.plainPromptDismissed = size > PLAIN_TEXT_BYTES
  }

  /** 更新标签的磁盘状态（只读 / 编码 / 会话排除 / 缺失） */
  function setFileMeta(id: string, meta: DocumentFileMeta): void {
    const doc = getDoc(id)
    if (doc) applyFileMeta(doc, meta)
  }

  /** 标记磁盘文件是否已不存在 */
  function setPathMissing(id: string, missing: boolean): void {
    const doc = getDoc(id)
    if (doc) doc.missing = missing
  }

  function setEditorState(id: string, state: EditorState): void {
    editorStates.set(id, state)
  }

  function getEditorState(id: string): EditorState | null {
    return editorStates.get(id) ?? null
  }

  /** 首次挂载时取出迁移过来的序列化状态，取出后不再参与后续重建 */
  function takeSerializedEditorState(id: string): unknown | null {
    const state = serializedEditorStates.get(id)
    if (state === undefined) return null
    serializedEditorStates.delete(id)
    return state
  }

  function setScrollPosition(id: string, position: ScrollPosition): void {
    scrollPositions.set(id, position)
  }

  function getScrollPosition(id: string): ScrollPosition {
    return scrollPositions.get(id) ?? { top: 0, anchor: 0 }
  }

  function setPreviewScrollPosition(id: string, position: PreviewScrollPosition): void {
    previewScrollPositions.set(id, position)
  }

  /** 预览区滚动位置（内容锚点 + 像素兜底）；没有记录（新文档）时从顶部开始 */
  function getPreviewScrollPosition(id: string): PreviewScrollPosition {
    return previewScrollPositions.get(id) ?? { top: 0, anchor: -1, offset: 0 }
  }

  // 初始标签：按当前界面语言选择欢迎示例文档
  const initial = createTab(null, manualContent(locale.value), t('window.manualName'))
  docs.value.push(initial)
  activeId.value = initial.id

  return {
    docs,
    activeId,
    activeDoc,
    addDocument,
    openPathDocument,
    newDocument,
    restoreSession,
    insertSessionTab,
    getDoc,
    activateDocument,
    closeDocument,
    cycleDocument,
    moveDocument,
    updateContent,
    replaceContent,
    setCursor,
    setHeadings,
    setLayoutMode,
    setOutlineVisible,
    markSaved,
    setPreviewOverride,
    switchToPlainMode,
    dismissPlainSuggestion,
    restoreMarkdownMode,
    setFileMeta,
    setPathMissing,
    setEditorState,
    getEditorState,
    takeSerializedEditorState,
    setScrollPosition,
    getScrollPosition,
    setPreviewScrollPosition,
    getPreviewScrollPosition
  }
})
