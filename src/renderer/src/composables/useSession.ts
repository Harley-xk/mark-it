import { onMounted, watch } from 'vue'
import { useDocumentsStore } from '../stores/documents'
import { useFile } from './useFile'
import type { SessionData } from '../../../shared/session-types'

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
  const file = useFile()

  /** 会话恢复完成前收到的命令行文件先缓存，避免与恢复结果互相覆盖 */
  const pendingOpenFiles: { path: string; content: string }[] = []
  let restoreDone = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function snapshot(): SessionData {
    return {
      tabs: docs.docs.map((doc) => ({
        path: doc.path,
        name: doc.name,
        content: doc.content,
        isModified: doc.isModified,
        cursorLine: doc.cursorLine,
        cursorCol: doc.cursorCol
      })),
      activeIndex: Math.max(
        docs.docs.findIndex((doc) => doc.id === docs.activeId),
        0
      )
    }
  }

  async function save(): Promise<void> {
    try {
      await window.api.session.save(snapshot())
    } catch (err) {
      console.error('Failed to save session:', err)
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
    await save()
  }

  async function restore(): Promise<void> {
    try {
      const saved = await window.api.session.load()
      if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        // 以磁盘内容为准（应用关闭期间文件可能被修改），读不到时回退到会话内容
        const tabs = await Promise.all(
          saved.tabs.map(async (tab) => {
            if (!tab.path) return tab
            const fromDisk = await window.api.readFile(tab.path)
            return fromDisk ? { ...tab, content: fromDisk.content } : tab
          })
        )
        docs.restoreSession(tabs, saved.activeIndex)
      }
    } catch (err) {
      console.error('Failed to restore session:', err)
    } finally {
      restoreDone = true
      for (const pending of pendingOpenFiles.splice(0)) {
        file.openFileFromPath(pending)
      }
    }
  }

  window.api.onOpenFile((result) => {
    if (restoreDone) file.openFileFromPath(result)
    else pendingOpenFiles.push(result)
  })

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
          doc.cursorCol
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
