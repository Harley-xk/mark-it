import { useEditorStore } from '../stores/editor'
import { useAppStore } from '../stores/app'
import { useConfirmBeforeAction } from './useConfirmUnsaved'

export function useFile() {
  const editor = useEditorStore()
  const app = useAppStore()
  const { proceed } = useConfirmBeforeAction()

  async function openFile() {
    await proceed(async () => {
      const result = await window.api.openFile()
      if (!result) return
      editor.setContent(result.content)
      app.filePath = result.path
      app.fileName = result.path.split(/[/\\]/).pop() || 'untitled.md'
      app.isModified = false
    }, '打开文件', '当前文件有未保存的修改，是否在打开新文件前保存？')
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
    await proceed(() => {
      editor.setContent('')
      app.filePath = null
      app.fileName = 'untitled.md'
      app.isModified = false
    }, '新建文件', '当前文件有未保存的修改，是否在新建文件前保存？')
  }

  return { openFile, saveFile, saveFileAs, newFile }
}
