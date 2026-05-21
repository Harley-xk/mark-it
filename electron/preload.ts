import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),
  saveFileAs: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Events
  onFileOpened: (callback: (path: string, content: string) => void) => {
    ipcRenderer.on('file:opened', (_, path, content) => callback(path, content))
  }
}

export type ExposedAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
