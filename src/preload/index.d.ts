import { ElectronAPI } from '@electron-toolkit/preload'
import type { ExposedAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: ExposedAPI
  }
}
