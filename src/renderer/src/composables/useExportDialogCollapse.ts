/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 在导出确认后将设置对话框收束到状态栏导出进度锚点
 */

const COLLAPSE_DURATION_MS = 280
const COLLAPSE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 将对话框动画到状态栏锚点。返回后调用方应关闭对话框。
 * 锚点缺失、元素不可见或系统要求减少动态效果时直接返回。
 */
export async function collapseExportDialog(
  dialogElement: HTMLElement,
  overlayElement: HTMLElement
): Promise<void> {
  const anchor = document.querySelector<HTMLElement>('[data-export-status-anchor]')
  if (!anchor || prefersReducedMotion()) return

  const dialogRect = dialogElement.getBoundingClientRect()
  const anchorRect = anchor.getBoundingClientRect()
  if (
    dialogRect.width === 0 ||
    dialogRect.height === 0 ||
    anchorRect.width === 0 ||
    anchorRect.height === 0
  ) {
    return
  }

  const translateX =
    anchorRect.left + anchorRect.width / 2 - (dialogRect.left + dialogRect.width / 2)
  const translateY =
    anchorRect.top + anchorRect.height / 2 - (dialogRect.top + dialogRect.height / 2)
  const scaleX = Math.max(0.04, anchorRect.width / dialogRect.width)
  const scaleY = Math.max(0.04, anchorRect.height / dialogRect.height)

  const dialogAnimation = dialogElement.animate(
    [
      {
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
        filter: 'blur(0)'
      },
      {
        opacity: 0.08,
        transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`,
        filter: 'blur(1.5px)'
      }
    ],
    {
      duration: COLLAPSE_DURATION_MS,
      easing: COLLAPSE_EASING,
      fill: 'forwards'
    }
  )
  const overlayAnimation = overlayElement.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: COLLAPSE_DURATION_MS,
    easing: 'ease-out',
    fill: 'forwards'
  })

  await Promise.allSettled([dialogAnimation.finished, overlayAnimation.finished])
}
