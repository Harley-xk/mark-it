/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 写入会话前采集编辑区 / 预览区的实时滚动位置，供退出重启后恢复
 */

/** 采集器：把指定标签当前的滚动位置写回 documents store 的缓存 */
type ScrollCapture = (docId: string) => void

const captures = new Set<ScrollCapture>()

/**
 * 注册一个滚动位置采集器，返回注销函数。
 * 采集器跟随组件生命周期注册 / 注销：布局切换导致组件卸载后不应再读取已脱离 DOM 的容器。
 */
export function registerScrollCapture(capture: ScrollCapture): () => void {
  captures.add(capture)
  return () => {
    captures.delete(capture)
  }
}

/**
 * 立即执行所有已注册采集器。
 * 平时滚动位置只在切换标签 / 卸载前写入缓存，关闭窗口或安装更新时直接取缓存
 * 会拿到活跃标签的旧值，因此写会话前必须先刷新一次。
 */
export function captureScrollPositions(docId: string): void {
  for (const capture of captures) capture(docId)
}
