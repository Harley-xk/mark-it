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

  return { openFile, saveFile, saveFileAs, newFile }
}
