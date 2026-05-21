import type { ExposedAPI } from '../electron/preload'

declare global {
  interface Window {
    api: ExposedAPI
  }
}
