/*
 * 作者: Harley-xk
 * 创建: 2026-11-13
 *
 * 描述: 全局缩放的读取与操作封装，状态由主进程统一广播
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useAppStore } from '../stores/app'

/** 与主进程 ZOOM_STEP 对齐；最终归一与范围夹取仍由主进程负责 */
const ZOOM_STEP = 0.1

/** 预设值必须落在主进程的 10% 归一网格上，否则会被归一成相邻值（如 1.25 → 1.3） */
export const ZOOM_PRESETS = [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3] as const

export interface GlobalZoomControl {
  percent: ComputedRef<number>
  atMin: ComputedRef<boolean>
  atMax: ComputedRef<boolean>
  presets: readonly number[]
  percentOf: (factor: number) => number
  setZoom: (factor: number) => void
  stepZoom: (direction: 1 | -1) => void
  resetZoom: () => void
}

export function useGlobalZoom(): GlobalZoomControl {
  const app = useAppStore()
  const percent = computed(() => app.zoomPercent)
  const atMin = computed(() => percent.value <= 50)
  const atMax = computed(() => percent.value >= 300)

  function percentOf(factor: number): number {
    return Math.round(factor * 100)
  }

  function setZoom(factor: number): void {
    void window.api.setZoom(factor)
  }

  function stepZoom(direction: 1 | -1): void {
    setZoom(Math.round((app.zoomFactor + direction * ZOOM_STEP) * 10) / 10)
  }

  function resetZoom(): void {
    setZoom(1)
  }

  return {
    percent,
    atMin,
    atMax,
    presets: ZOOM_PRESETS,
    percentOf,
    setZoom,
    stepZoom,
    resetZoom
  }
}
