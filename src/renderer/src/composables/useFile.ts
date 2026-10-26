import { useDocumentsStore, type DocumentTab } from '../stores/documents'
import { confirmUnsaved } from './useConfirmUnsaved'

export function useFile() {
  const docs = useDocumentsStore()

  /**
   * 保存指定标签页
   * @param forceDialog 为 true 时始终弹出"另存为"对话框
   * @returns 是否保存成功（用户取消另存为返回 false）
   */
  async function saveDocument(doc: DocumentTab, forceDialog = false): Promise<boolean> {
    if (!doc.path || forceDialog) {
      const path = await window.api.saveFileAs(doc.content)
      if (!path) return false
      docs.markSaved(doc.id, path)
      return true
    }

    await window.api.saveFile(doc.path, doc.content)
    docs.markSaved(doc.id)
    return true
  }

  /** 打开文件对话框（支持多选），每个文件对应一个标签页 */
  async function openFile(): Promise<void> {
    const files = await window.api.openFiles()
    if (!files || files.length === 0) return
    const opened = files.map((file) => docs.openPathDocument(file.path, file.content))
    // 多选时激活第一个文件
    if (opened.length > 0) docs.activateDocument(opened[0].id)
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

  /** 新建标签页，不打扰当前文档 */
  function newFile(): void {
    const active = docs.activeDoc
    // 当前已经是未修改的空白文档时直接复用，避免堆积空标签
    if (active && active.path === null && !active.isModified && active.content === '') return
    docs.newDocument('')
  }

  /** 关闭标签页，先确认该标签页的未保存修改 */
  async function closeTab(id?: string): Promise<void> {
    const doc = id ? docs.getDoc(id) : docs.activeDoc
    if (!doc) return

    if (doc.isModified) {
      const action = await confirmUnsaved(
        '关闭文件',
        `「${doc.name}」有未保存的修改，是否在关闭前保存？`,
        undefined,
        true
      )
      if (action === 'cancel') return
      if (action === 'save' && !(await saveDocument(doc))) return
    }

    docs.closeDocument(doc.id)

    // 关闭最后一个标签页时一并关闭主窗口（所有未保存修改已在此前确认）
    if (docs.docs.length === 0) {
      window.api.close()
    }
  }

  /**
   * 刷新：重新读取磁盘上的当前文件
   * - 无未保存修改（或本地内容与磁盘一致）时直接加载最新内容
   * - 有未保存修改时提示用户谨慎选择：放弃本地修改，或用本地内容覆盖磁盘
   */
  async function refreshFile(): Promise<void> {
    const doc = docs.activeDoc
    if (!doc || !doc.path) return
    const result = await window.api.readFile(doc.path)
    if (!result) return

    if (doc.isModified && doc.content !== result.content) {
      const action = await confirmUnsaved(
        '刷新文件',
        '磁盘上的文件已被其他程序修改，而当前编辑内容有未保存的修改：\n\n' +
          '「放弃修改」将丢弃本地修改，加载磁盘上的最新内容；\n' +
          '「保存」将用本地内容覆盖磁盘上的修改。',
        { save: '保存（覆盖磁盘）', discard: '放弃修改（载入磁盘）' },
        true
      )
      if (action === 'cancel') return
      if (action === 'save') {
        await saveDocument(doc)
        return
      }
    }

    docs.replaceContent(doc.id, result.content)
  }

  return {
    openFile,
    openFileFromPath,
    saveFile,
    saveFileAs,
    saveDocument,
    newFile,
    closeTab,
    refreshFile
  }
}
