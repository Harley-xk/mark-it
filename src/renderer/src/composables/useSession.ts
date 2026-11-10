import { onMounted, onUnmounted, watch } from 'vue'
import { useDocumentsStore } from '../stores/documents'
import { useAppStore } from '../stores/app'
import { useEditorStore } from '../stores/editor'
import { useFile } from './useFile'
import { markSessionReady } from './session-ready'
import { captureScrollPositions } from './session-scroll'
import { decodeText } from '../utils/text-encoding'
import { serializeEditorState } from '../utils/editor-state-transfer'
import type { SessionData } from '../../../shared/session-types'
import type { EditorHistoryEntries } from '../../../shared/history-types'
import type { TabTransferPayload } from '../../../shared/window-types'

const SAVE_DEBOUNCE_MS = 800

let session: { flush: () => Promise<void> } | null = null

/**
 * 把当前打开的标签页（含未保存内容）写入磁盘，并在启动时恢复。
 * 自动更新会重启应用，重启后据此重新打开原来的文档。
 */
export function useSession(): { flush: () => Promise<void> } {
  // 模块级单例：HMR 或重复调用时避免重复注册监听
  if (session) return session

  const docs = useDocumentsStore()
  const app = useAppStore()
  const editor = useEditorStore()
  const file = useFile()

  /** 会话恢复完成前收到的命令行文件先缓存，避免与恢复结果互相覆盖 */
  const pendingOpenFiles: { path: string; content: string }[] = []
  let restoreDone = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function snapshot(): SessionData {
    // 缓存里的滚动位置只在切换标签 / 卸载时写入，这里先刷新活跃标签的实时值
    if (docs.activeId) captureScrollPositions(docs.activeId)

    return {
      tabs: docs.docs.map((doc) => {
        const scroll = docs.getScrollPosition(doc.id)
        const previewScroll = docs.getPreviewScrollPosition(doc.id)
        return {
          historyId: doc.historyId,
          path: doc.path,
          name: doc.name,
          content: doc.content,
          isModified: doc.isModified,
          cursorLine: doc.cursorLine,
          cursorCol: doc.cursorCol,
          eol: doc.eol,
          bom: doc.bom,
          layoutMode: doc.layoutMode,
          scrollAnchor: scroll.anchor,
          scrollTop: scroll.top,
          previewScrollTop: previewScroll.top,
          previewScrollAnchor: previewScroll.anchor,
          previewScrollOffset: previewScroll.offset
        }
      }),
      activeIndex: Math.max(
        docs.docs.findIndex((doc) => doc.id === docs.activeId),
        0
      )
    }
  }

  async function save(): Promise<boolean> {
    try {
      const saved = await window.api.session.save(snapshot())
      // 写失败（只读目录 / 磁盘已满）必须可见：状态栏会显示「会话保存失败」
      app.setSessionSaveFailed(!saved)
      if (!saved) console.warn('Failed to save session: main process returned false')
      return saved
    } catch (err) {
      app.setSessionSaveFailed(true)
      console.error('Failed to save session:', err)
      return false
    }
  }

  async function saveHistory(): Promise<boolean> {
    const entries: EditorHistoryEntries = {}
    for (const doc of docs.docs) {
      const state =
        doc.id === docs.activeId
          ? (editor.editorView?.state ?? docs.getEditorState(doc.id))
          : docs.getEditorState(doc.id)
      if (!state) continue
      const serialized = serializeEditorState(state)
      if (serialized !== undefined) entries[doc.historyId] = serialized
    }
    try {
      const saved = await window.api.history.save(entries)
      if (!saved) console.warn('Failed to save editor history: main process returned false')
      return saved
    } catch (err) {
      console.error('Failed to save editor history:', err)
      return false
    }
  }

  function queueSave(): void {
    if (!restoreDone) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void save()
    }, SAVE_DEBOUNCE_MS)
  }

  /** 立即写入会话（关闭窗口 / 安装更新前调用） */
  async function flush(): Promise<void> {
    if (!restoreDone) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const sessionSaved = await save()
    const historySaved = await saveHistory()
    if (!sessionSaved || !historySaved) app.setSessionSaveFailed(true)
  }

  async function restore(): Promise<void> {
    let pendingTransferId: string | null = null
    let pendingTransfer: TabTransferPayload | null = null
    let transferAccepted = false
    try {
      const context = await window.api.getWindowContext()
      pendingTransferId = context?.pendingTransferId ?? null
      const persistedHistory = await window.api.history.load()
      if (pendingTransferId) pendingTransfer = await window.api.takePendingTabTransfer()
      const saved = await window.api.session.load()
      if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        // 以磁盘内容为准（应用关闭期间文件可能被修改），读不到时回退到会话内容
        const tabs = await Promise.all(
          saved.tabs.map(async (tab) => {
            if (!tab.path) return tab
            const fromDisk = await window.api.readFile(tab.path)
            if (!fromDisk) return tab
            // 以磁盘内容为准，同时把磁盘当前的换行符 / BOM 策略带回标签
            const decoded = decodeText(fromDisk.content)
            return { ...tab, content: decoded.text, eol: decoded.eol, bom: decoded.bom }
          })
        )
        const serializedStates = new Map<number, unknown>()
        tabs.forEach((tab, index) => {
          if (tab.historyId && persistedHistory[tab.historyId] !== undefined) {
            serializedStates.set(index, persistedHistory[tab.historyId])
          }
        })
        if (pendingTransfer?.editorStateJson) {
          const transferredIndex = tabs.findIndex(
            (tab) =>
              tab.path === pendingTransfer?.tab.path && tab.name === pendingTransfer?.tab.name
          )
          if (transferredIndex >= 0) {
            serializedStates.set(transferredIndex, pendingTransfer.editorStateJson)
          }
        }
        transferAccepted = docs.restoreSession(tabs, saved.activeIndex, serializedStates)
      }
    } catch (err) {
      console.error('Failed to restore session:', err)
    } finally {
      restoreDone = true
      markSessionReady()
      if (pendingTransferId) {
        if (transferAccepted) window.api.ackTabTransfer(pendingTransferId)
        else window.api.rejectTabTransfer(pendingTransferId)
      }
      for (const pending of pendingOpenFiles.splice(0)) {
        file.openFileFromPath(pending)
      }
    }
  }

  const offOpenFile = window.api.onOpenFile((result) => {
    if (restoreDone) file.openFileFromPath(result)
    else pendingOpenFiles.push(result)
  })
  onUnmounted(offOpenFile)

  onMounted(() => {
    void restore()

    watch(
      () =>
        docs.docs.map((doc) => [
          doc.id,
          doc.path,
          doc.name,
          doc.content,
          doc.isModified,
          doc.cursorLine,
          doc.cursorCol,
          doc.layoutMode
        ]),
      queueSave
    )
    watch(() => docs.activeId, queueSave)
  })

  session = { flush }
  return session
}

/** 在任意位置立即写入会话（不触发新的初始化） */
export function flushSession(): Promise<void> {
  return session ? session.flush() : Promise.resolve()
}
