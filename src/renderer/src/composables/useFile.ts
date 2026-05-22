import { useEditorStore } from '../stores/editor'
import { useAppStore } from '../stores/app'

export function useFile() {
  const editor = useEditorStore()
  const app = useAppStore()

  async function openFile() {
    const result = await window.api.openFile()
    if (!result) return
    editor.setContent(result.content)
    app.filePath = result.path
    app.fileName = result.path.split(/[/\\]/).pop() || 'untitled.md'
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

  function newFile() {
    editor.setContent('')
    app.filePath = null
    app.fileName = 'untitled.md'
    app.isModified = false
  }

  return { openFile, saveFile, saveFileAs, newFile }
}
