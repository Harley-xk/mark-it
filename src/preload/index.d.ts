import type { ExposedAPI } from './index'

declare global {
  interface Window {
    api: ExposedAPI
  }
}
