import type { ExposedAPI } from '../../preload/index'

declare global {
  interface Window {
    api: ExposedAPI
  }
}
