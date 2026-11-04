import { useDocumentsStore, samePath, type DocumentTab } from '../stores/documents'
import { confirmUnsaved } from './useConfirmUnsaved'
import { whenSessionReady } from './session-ready'
import { diffLines } from '../utils/text-diff'
import WELCOME_CONTENT from '../assets/welcome.md?raw'

/** 内置使用手册的标签名 */
const MANUAL_NAME = '使用手册.md'

/**
 * 比较内容时忽略换行符差异：编辑器内部统一使用 \n，磁盘文件可能是 CRLF，
 * 只差换行符时不应被视为外部修改。
 */
function sameContent(a: string, b: string): boolean {
  return a === b || a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n')
}

export function useFile() {
  const docs = useDocumentsStore()

  /**
   * 保存指定标签页。
   * 保存前会读取一次磁盘：如果文件已被其他程序修改且本地也有未保存修改，
   * 参考 VS Code 弹出冲突确认，并列出磁盘版本与本地版本的逐行差异。
   *
   * @param forceDialog 为 true 时始终弹出"另存为"对话框
   * @param skipConflictCheck 调用方已经确认过冲突（例如手动刷新时选择了覆盖磁盘）
   * @returns 是否继续后续操作（用户取消返回 false；选择载入磁盘也算已解决冲突）
   */
  async function saveDocument(
    doc: DocumentTab,
    forceDialog = false,
    skipConflictCheck = false
  ): Promise<boolean> {
    if (!doc.path || forceDialog) {
      const path = await window.api.saveFileAs(doc.content)
      if (!path) return false
      docs.markSaved(doc.id, path)
      return true
    }

    if (!skipConflictCheck) {
      const disk = await window.api.readFile(doc.path)
      if (disk && sameContent(disk.content, doc.content)) {
        // 磁盘上的内容已与本地一致（例如外部程序写入了相同内容）：没有冲突
        docs.markSaved(doc.id)
        return true
      }
      if (disk && !sameContent(disk.content, doc.diskContent)) {
        if (!doc.isModified) {
          // 本地没有修改：以磁盘为准，避免用过期内容覆盖外部修改
          docs.replaceContent(doc.id, disk.content)
          return true
        }

        const action = await confirmUnsaved(
          '文件冲突',
          `「${doc.name}」在磁盘上已被其他程序修改，本地也有未保存的修改。`,
          { save: '覆盖磁盘', discard: '载入磁盘' },
          true,
          { cancelText: '取消', diff: diffLines(disk.content, doc.content) }
        )

        if (action === 'cancel') return false
        if (action === 'discard') {
          // 放弃本地修改，载入磁盘版本；本次保存不再执行
          docs.replaceContent(doc.id, disk.content)
          return true
        }
      }
    }

    await window.api.saveFile(doc.path, doc.content)
    docs.markSaved(doc.id)
    return true
  }

  /** 打开文件对话框（支持多选），每个文件对应一个标签页 */
  async function openFile(): Promise<void> {
    const files = await window.api.openFiles()
    if (!files || files.length === 0) return
    // 会话恢复会整体替换标签页；等待恢复完成，避免刚打开的文件被启动恢复覆盖
    await whenSessionReady()
    const before = new Set(docs.docs.map((doc) => doc.id))
    const opened = files.map((file) => docs.openPathDocument(file.path, file.content))
    // 多选时优先激活新打开的最后一个文件；全部已在标签页中时激活最后一项，
    // 保证打开动作结束后看到的总是本次操作对应的标签
    const fresh = opened.filter((doc) => !before.has(doc.id))
    const target = fresh.length > 0 ? fresh[fresh.length - 1] : opened[opened.length - 1]
    if (target) docs.activateDocument(target.id)
  }

  /** 打开主进程发来的文件（右键"使用 MarkIt 打开" / 命令行传参） */
  function openFileFromPath(result: { path: string; content: string }): void {
    docs.openPathDocument(result.path, result.content)
  }

  async function saveFile(): Promise<void> {
    const doc = docs.activeDoc
    if (!doc) return
    await saveDocument(doc)
  }

  async function saveFileAs(): Promise<void> {
    const doc = docs.activeDoc
    if (!doc) return
    await saveDocument(doc, true)
  }

  /** 在系统文件管理器中定位当前文档（未保存的新建文档不可用） */
  async function showInFolder(): Promise<void> {
    const doc = docs.activeDoc
    if (!doc?.path) return
    await window.api.showItemInFolder(doc.path)
  }

  /** 新建标签页，不打扰当前文档 */
  function newFile(): void {
    const active = docs.activeDoc
    // 当前已经是未修改的空白文档时直接复用，避免堆积空标签
    if (active && active.path === null && !active.isModified && active.content === '') return
    docs.newDocument('')
  }

  /** 打开内置使用手册：没有手册标签时新建，已存在则直接激活，避免重复堆积 */
  async function openManual(): Promise<void> {
    // 会话恢复会整体替换标签页，等恢复完成后再查找/新建，避免刚打开的手册被覆盖
    await whenSessionReady()
    const existing = docs.docs.find((doc) => doc.path === null && doc.name === MANUAL_NAME)
    if (existing) {
      docs.activateDocument(existing.id)
      return
    }
    docs.addDocument(null, WELCOME_CONTENT, MANUAL_NAME)
  }

  /**
   * 关闭单个标签页（关闭前确认未保存修改）。
   * @returns 是否已关闭；用户取消或保存失败时返回 false
   */
  async function closeOne(doc: DocumentTab): Promise<boolean> {
    if (doc.isModified) {
      const action = await confirmUnsaved(
        '关闭文件',
        `「${doc.name}」有未保存的修改，是否在关闭前保存？`,
        undefined,
        true
      )
      if (action === 'cancel') return false
      if (action === 'save' && !(await saveDocument(doc))) return false
    }

    docs.closeDocument(doc.id)
    return true
  }

  /**
   * 批量关闭标签页（关闭其他 / 关闭左侧 / 关闭右侧）。
   * 逐个确认未保存修改，任一标签取消时停止，后续标签保持打开。
   * @param ids 要关闭的标签，按传入顺序处理
   * @param keepId 关闭后应保持激活的标签（通常是右键选中的标签）
   */
  async function closeTabs(ids: string[], keepId?: string): Promise<void> {
    // 关闭前先把激活标签移到不会被关闭的标签上，避免关闭过程中
    // 激活标签在将要关闭的标签之间来回跳转
    if (keepId && docs.getDoc(keepId) && ids.includes(docs.activeId)) {
      docs.activateDocument(keepId)
    }

    for (const id of ids) {
      const doc = docs.getDoc(id)
      if (!doc) continue
      if (!(await closeOne(doc))) return
    }

    // 关闭最后一个标签页时一并关闭主窗口（所有未保存修改已在此前确认）
    if (docs.docs.length === 0) {
      window.api.close()
    }
  }

  /** 关闭标签页，先确认该标签页的未保存修改 */
  async function closeTab(id?: string): Promise<void> {
    const doc = id ? docs.getDoc(id) : docs.activeDoc
    if (!doc) return
    if (!(await closeOne(doc))) return

    // 关闭最后一个标签页时一并关闭主窗口（所有未保存修改已在此前确认）
    if (docs.docs.length === 0) {
      window.api.close()
    }
  }

  /**
   * 用磁盘上的最新内容协调标签页。
   * - 磁盘内容与编辑器一致（例如应用自身刚保存、事件晚到）：只同步快照
   * - 磁盘内容与上次载入的版本一致：没有外部变化，忽略
   * - 本地没有未保存修改：直接载入磁盘内容
   * - 本地有未保存修改：自动刷新不打断编辑，保留本地内容；
   *   等到保存时再检测冲突并展示差异（参考 VS Code）
   *
   * @param promptOnConflict 手动刷新（F5）时为 true，立即让用户选择如何处理冲突
   */
  async function reconcileDiskContent(
    doc: DocumentTab,
    content: string,
    promptOnConflict: boolean
  ): Promise<void> {
    if (sameContent(content, doc.content)) {
      if (!sameContent(doc.diskContent, content)) docs.markSaved(doc.id)
      return
    }
    if (sameContent(content, doc.diskContent)) return

    if (!doc.isModified) {
      docs.replaceContent(doc.id, content)
      return
    }

    if (!promptOnConflict) return

    const action = await confirmUnsaved(
      '文件冲突',
      `「${doc.name}」在磁盘上已被其他程序修改，本地也有未保存的修改。`,
      { save: '覆盖磁盘', discard: '载入磁盘' },
      true,
      { cancelText: '取消', diff: diffLines(content, doc.content) }
    )

    if (action === 'save') {
      await saveDocument(doc, false, true)
    } else if (action === 'discard') {
      docs.replaceContent(doc.id, content)
    }
  }

  /** 处理主进程推送的外部文件变更（仅当前活跃标签对应的文件会被监视） */
  async function applyExternalContent(change: { path: string; content: string }): Promise<void> {
    const doc = docs.activeDoc
    if (!doc?.path || !samePath(doc.path, change.path)) return
    // 自动刷新不弹窗：有本地修改时保留内容，保存时再处理冲突
    await reconcileDiskContent(doc, change.content, false)
  }

  /**
   * 刷新：手动重新读取磁盘上的当前文件。
   * 磁盘内容没有变化时不再误报「已被其他程序修改」，仅在本地有修改时询问是否丢弃。
   */
  async function refreshFile(): Promise<void> {
    const doc = docs.activeDoc
    if (!doc || !doc.path) return
    const result = await window.api.readFile(doc.path)
    if (!result) return

    if (sameContent(result.content, doc.diskContent)) {
      if (!doc.isModified) return
      const action = await confirmUnsaved(
        '重新载入',
        '磁盘上的文件没有变化。是否放弃当前未保存的修改，重新载入磁盘内容？',
        { save: '保存（覆盖磁盘）', discard: '放弃修改（载入磁盘）' },
        true
      )
      if (action === 'save') await saveDocument(doc, false, true)
      else if (action === 'discard') docs.replaceContent(doc.id, result.content)
      return
    }

    await reconcileDiskContent(doc, result.content, true)
  }

  return {
    openFile,
    openFileFromPath,
    saveFile,
    saveFileAs,
    saveDocument,
    newFile,
    openManual,
    closeTab,
    closeTabs,
    refreshFile,
    applyExternalContent,
    showInFolder
  }
}
