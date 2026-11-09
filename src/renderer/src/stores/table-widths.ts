/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 按文档与表头保存预览表格的列宽与总宽缩放，仅用于界面展示，不写回 Markdown
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sanitizeLayout, type TableLayout } from '../utils/table-resize'

/** localStorage 键；前缀 markit- 属于品牌不变量，不得改名 */
const STORAGE_KEY = 'markit-table-widths'

/** 表标识 → 表格布局 */
type TableWidthMap = Record<string, TableLayout>
/** 文档键 → 表标识 → 表格布局 */
type TableWidthStore = Record<string, TableWidthMap>

/** 未保存文档的键带此前缀，只在当前会话有效，不写入 localStorage */
const UNTITLED_PREFIX = 'untitled:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 逐层校验存档，丢弃结构或数值非法的条目，避免损坏数据进入渲染 */
function loadLayouts(): TableWidthStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}

    const store: TableWidthStore = {}
    for (const [docKey, tables] of Object.entries(parsed)) {
      if (!isRecord(tables)) continue
      const tableLayouts: TableWidthMap = {}
      for (const [tableKey, layout] of Object.entries(tables)) {
        const sanitized = sanitizeLayout(layout)
        if (sanitized) tableLayouts[tableKey] = sanitized
      }
      if (Object.keys(tableLayouts).length > 0) store[docKey] = tableLayouts
    }
    return store
  } catch (err) {
    console.warn('Failed to load table widths:', err)
    return {}
  }
}

export const useTableWidthsStore = defineStore('table-widths', () => {
  const layouts = ref<TableWidthStore>(loadLayouts())

  function persist(): void {
    const persistable: TableWidthStore = {}
    for (const [docKey, tables] of Object.entries(layouts.value)) {
      if (!docKey.startsWith(UNTITLED_PREFIX)) persistable[docKey] = tables
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
    } catch (err) {
      console.warn('Failed to save table widths:', err)
    }
  }

  function getLayout(docKey: string, tableKey: string): TableLayout | null {
    return layouts.value[docKey]?.[tableKey] ?? null
  }

  function setLayout(docKey: string, tableKey: string, next: TableLayout): void {
    const sanitized = sanitizeLayout(next)
    if (!sanitized) return
    if (!layouts.value[docKey]) layouts.value[docKey] = {}
    layouts.value[docKey][tableKey] = sanitized
    persist()
  }

  function clearWidths(docKey: string, tableKey: string): void {
    const tables = layouts.value[docKey]
    if (!tables || !tables[tableKey]) return
    delete tables[tableKey]
    if (Object.keys(tables).length === 0) delete layouts.value[docKey]
    persist()
  }

  return { getLayout, setLayout, clearWidths }
})
