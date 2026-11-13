import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'

/**
 * 全局缩放由主进程执行（Ctrl/Cmd + = / - 缩放，Ctrl/Cmd + 0 恢复 100%），
 * 这里只把当前比例同步到 store，供状态栏与设置页展示。
 */
export function useWindowZoom(): void {
  const app = useAppStore()
  let offZoomChange: (() => void) | null = null

  onMounted(async () => {
    offZoomChange = window.api.onZoomChange((factor) => {
      app.zoomFactor = factor
    })
    app.zoomFactor = await window.api.getZoom()
  })

  onUnmounted(() => {
    offZoomChange?.()
    offZoomChange = null
  })
}
