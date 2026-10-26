import { onMounted } from 'vue'
import { useAppStore } from '../stores/app'

/**
 * 整窗缩放由主进程执行（Ctrl/Cmd + = / - 缩放，Ctrl/Cmd + 0 恢复 100%），
 * 这里只把当前比例同步到 store，供状态栏展示。
 */
export function useWindowZoom(): void {
  const app = useAppStore()

  onMounted(async () => {
    window.api.onZoomChange((factor) => {
      app.zoomFactor = factor
    })
    app.zoomFactor = await window.api.getZoom()
  })
}
