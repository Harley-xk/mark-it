import { useEditorStore } from '../stores/editor'
import { useAppStore } from '../stores/app'
import { confirmUnsaved } from './useConfirmUnsaved'

export function useFile() {
  const editor = useEditorStore()
  const app = useAppStore()

  async function openFile() {
    const result = await confirmUnsaved('打开文件', '当前文件有未保存的修改，是否在打开新文件前保存？')
    if (result === 'cancel') return
    if (result === 'save') await saveFile()

    const fileResult = await window.api.openFile()
    if (!fileResult) return
    editor.setContent(fileResult.content)
    app.filePath = fileResult.path
    app.fileName = fileResult.path.split(/[/\\]/).pop() || 'untitled.md'
    app.isModified = false
  }

  async function saveFile() {
    if (!app.filePath) {
      return saveFileAs()
    }
    await window.api.saveFile(app.filePath, editor.content)
    app.isModified = false
  }

  async function saveFileAs() {
    const path = await window.api.saveFileAs(editor.content)
    if (!path) return
    app.filePath = path
    app.fileName = path.split(/[/\\]/).pop() || 'untitled.md'
    app.isModified = false
  }

  async function newFile() {
    const result = await confirmUnsaved('新建文件', '当前文件有未保存的修改，是否在新建文件前保存？')
    if (result === 'cancel') return
    if (result === 'save') await saveFile()

    editor.setContent('')
    app.filePath = null
    app.fileName = 'untitled.md'
    app.isModified = false
  }

  /**
   * 刷新：重新读取磁盘上的当前文件
   * - 无未保存修改（或本地内容与磁盘一致）时直接加载最新内容
   * - 有未保存修改时提示用户谨慎选择：放弃本地修改，或用本地内容覆盖磁盘
   */
  async function refreshFile(): Promise<void> {
    if (!app.filePath) return
    const result = await window.api.readFile(app.filePath)
    if (!result) return

    if (app.isModified && editor.content !== result.content) {
      const action = await confirmUnsaved(
        '刷新文件',
        '磁盘上的文件已被其他程序修改，而当前编辑内容有未保存的修改：\n\n' +
          '「放弃修改」将丢弃本地修改，加载磁盘上的最新内容；\n' +
          '「保存」将用本地内容覆盖磁盘上的修改。',
        { save: '保存（覆盖磁盘）', discard: '放弃修改（载入磁盘）' }
      )
      if (action === 'cancel') return
      if (action === 'save') {
        await saveFile()
        return
      }
    }

    editor.setContent(result.content)
    app.isModified = false
  }

  return { openFile, saveFile, saveFileAs, newFile, refreshFile }
}
