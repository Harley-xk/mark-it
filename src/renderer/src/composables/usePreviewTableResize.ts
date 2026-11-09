/*
 * 作者: Harley-xk
 * 创建: 2026-11-06
 *
 * 描述: 预览表格列宽拖动：注入表头手柄，并在每次 v-html 重渲染后恢复列宽
 */
import { onBeforeUnmount, type Ref } from 'vue'
import { useDocumentsStore } from '../stores/documents'
import { useTableWidthsStore } from '../stores/table-widths'
import { normalizePath } from '../utils/path'
import {
  buildTableKey,
  hashTableHeaders,
  normalizeWidths,
  resizeAdjacentColumnWidths,
  resizeLastColumn,
  resolveMinColumnRatio,
  type TableLayout
} from '../utils/table-resize'

const RESIZABLE_CLASS = 'markit-table-resizable'
const RESIZED_CLASS = 'markit-table-resized'
const DRAGGING_CLASS = 'markit-table-dragging'
const HANDLE_CLASS = 'markit-col-resizer'
/** 只识别本功能创建的 colgroup，避免覆盖文档内原始 HTML 自带的 colgroup */
const COLGROUP_CLASS = 'markit-table-colgroup'

interface DragState {
  table: HTMLTableElement
  tableKey: string
  handle: HTMLElement
  index: number
  /** 按下时的布局快照，拖动过程中始终以它为基准计算总增量 */
  startLayout: TableLayout
  startX: number
  /** 按下时的表格像素宽度；最右列拖动时用它换算总宽变化 */
  tableWidth: number
  current: TableLayout
  /** 是否已经实际改动过列宽；仅点击手柄不写入存档 */
  changed: boolean
}

export function usePreviewTableResize(previewRef: Ref<HTMLDivElement | undefined>): {
  apply: () => void
} {
  const documents = useDocumentsStore()
  const widthStore = useTableWidthsStore()
  /** 表格节点 → 表标识；DOM 随渲染重建，用 WeakMap 避免额外的数据集属性 */
  const tableKeys = new WeakMap<HTMLTableElement, string>()
  let drag: DragState | null = null
  /** 双击手柄恢复自动宽度。pointerdown 的 preventDefault 可能抑制 dblclick，这里自行判定 */
  let lastHandle: HTMLElement | null = null
  let lastHandleDownAt = 0

  /** 未保存文档按标签 id 区分，仅当前会话有效 */
  function currentDocKey(): string | null {
    const doc = documents.activeDoc
    if (!doc) return null
    return doc.path ? normalizePath(doc.path) : `untitled:${doc.id}`
  }

  function tableElements(): HTMLTableElement[] {
    const root = previewRef.value?.querySelector<HTMLElement>('.preview-content')
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLTableElement>('table')).filter(
      (table) =>
        !table.classList.contains('frontmatter-table') && !table.closest('.frontmatter-block')
    )
  }

  function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
    const row = table.tHead?.rows[0]
    return row ? Array.from(row.cells) : []
  }

  /** 从已应用的 colgroup 或当前渲染尺寸读取列宽比例 */
  function measuredWidths(table: HTMLTableElement): number[] {
    const columns = Array.from(
      table.querySelectorAll<HTMLTableColElement>(`colgroup.${COLGROUP_CLASS} > col`)
    )
    if (columns.length > 0) {
      const ratios = columns.map((col) => Number.parseFloat(col.style.width))
      if (ratios.every((ratio) => Number.isFinite(ratio) && ratio > 0)) {
        return normalizeWidths(ratios)
      }
    }
    const tableWidth = table.getBoundingClientRect().width
    const cells = headerCells(table)
    if (tableWidth <= 0 || cells.length === 0) return []
    return normalizeWidths(cells.map((cell) => cell.getBoundingClientRect().width))
  }

  /** 读取表格总宽相对预览内容宽度的缩放；未调整过最右列时内联宽度为 100% */
  function readScale(table: HTMLTableElement): number {
    const percent = Number.parseFloat(table.style.width)
    return Number.isFinite(percent) && percent > 0 ? percent / 100 : 1
  }

  function measuredLayout(table: HTMLTableElement): TableLayout | null {
    const widths = measuredWidths(table)
    if (widths.length === 0) return null
    return { widths, scale: readScale(table) }
  }

  function ensureColgroup(table: HTMLTableElement, count: number): HTMLTableColElement {
    let colgroup = table.querySelector<HTMLTableColElement>(`colgroup.${COLGROUP_CLASS}`)
    if (!colgroup) {
      colgroup = document.createElement('colgroup')
      colgroup.className = COLGROUP_CLASS
      table.insertBefore(colgroup, table.firstChild)
    }
    while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col'))
    while (colgroup.children.length > count) colgroup.lastElementChild?.remove()
    return colgroup
  }

  function applyLayout(table: HTMLTableElement, layout: TableLayout): void {
    const cells = headerCells(table)
    // 列数变化（表格被编辑过）时不套用过期的列宽
    if (cells.length === 0 || layout.widths.length !== cells.length) {
      resetTable(table)
      return
    }
    table.classList.add(RESIZABLE_CLASS, RESIZED_CLASS)
    // scale > 1 时表格宽于预览内容，预览区出现横向滚动条
    table.style.width = `${(layout.scale * 100).toFixed(2)}%`
    const colgroup = ensureColgroup(table, layout.widths.length)
    layout.widths.forEach((ratio, index) => {
      const col = colgroup.children[index] as HTMLTableColElement
      col.style.width = `${(ratio * 100).toFixed(2)}%`
    })
  }

  /** 恢复自动布局；手柄保留，用户可以再次拖动 */
  function resetTable(table: HTMLTableElement): void {
    table.classList.add(RESIZABLE_CLASS)
    table.classList.remove(RESIZED_CLASS)
    table.style.width = ''
    table.querySelector(`colgroup.${COLGROUP_CLASS}`)?.remove()
  }

  function ensureHandles(table: HTMLTableElement): void {
    headerCells(table).forEach((cell, index) => {
      if (cell.querySelector(`:scope > .${HANDLE_CLASS}`)) return
      const handle = document.createElement('span')
      handle.className = HANDLE_CLASS
      handle.dataset.columnIndex = String(index)
      handle.title = '拖动调整列宽，双击恢复自动宽度'
      handle.addEventListener('pointerdown', onHandlePointerDown)
      handle.addEventListener('dblclick', onHandleDoubleClick)
      cell.appendChild(handle)
    })
  }

  function onHandlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    const table = handle.closest('table')
    const cell = handle.closest('th')
    if (!(table instanceof HTMLTableElement) || !(cell instanceof HTMLTableCellElement)) return
    const tableKey = tableKeys.get(table)
    const index = Number.parseInt(handle.dataset.columnIndex ?? '', 10)
    if (!tableKey || !Number.isInteger(index)) return

    const now = Date.now()
    const isDoubleClick = lastHandle === handle && now - lastHandleDownAt < 400
    lastHandle = handle
    lastHandleDownAt = now

    if (isDoubleClick) {
      event.preventDefault()
      event.stopPropagation()
      lastHandle = null
      resetTableWithStore(table, tableKey)
      return
    }

    const layout = measuredLayout(table)
    if (!layout || layout.widths.length !== headerCells(table).length) return

    event.preventDefault()
    event.stopPropagation()

    handle.classList.add('dragging')
    drag = {
      table,
      tableKey,
      handle,
      index,
      startLayout: layout,
      startX: event.clientX,
      tableWidth: table.getBoundingClientRect().width,
      current: layout,
      changed: false
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag) return
    // 拖动过程中内容被编辑时预览会重建 DOM，旧表格已脱离文档，结束本次拖动
    if (!drag.table.isConnected) {
      endDrag()
      return
    }
    const delta = drag.tableWidth > 0 ? (event.clientX - drag.startX) / drag.tableWidth : 0
    // 最小宽度按像素定义，换算成本表宽度下的比例，避免宽预览下窄列压不下去
    const minRatio = resolveMinColumnRatio(drag.tableWidth)
    const lastIndex = drag.startLayout.widths.length - 1
    // 最右列没有右邻列可让位，改为改变表格总宽；内部边界只调整相邻两列
    const next =
      drag.index === lastIndex
        ? resizeLastColumn(drag.startLayout, delta, minRatio)
        : {
            widths: resizeAdjacentColumnWidths(
              drag.startLayout.widths,
              drag.index,
              delta,
              minRatio
            ),
            scale: drag.startLayout.scale
          }
    drag.current = next
    drag.changed = true
    drag.table.classList.add(DRAGGING_CLASS)
    applyLayout(drag.table, next)
  }

  function onPointerUp(): void {
    if (!drag) return
    const { tableKey, current, changed } = drag
    endDrag()
    if (!changed) return
    const docKey = currentDocKey()
    if (docKey) widthStore.setLayout(docKey, tableKey, current)
  }

  function endDrag(): void {
    if (drag) {
      drag.table.classList.remove(DRAGGING_CLASS)
      drag.handle.classList.remove('dragging')
    }
    drag = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }

  function resetTableWithStore(table: HTMLTableElement, tableKey: string): void {
    const docKey = currentDocKey()
    if (docKey && tableKey) widthStore.clearWidths(docKey, tableKey)
    resetTable(table)
  }

  function onHandleDoubleClick(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    const table = handle.closest('table')
    if (!(table instanceof HTMLTableElement)) return
    const tableKey = tableKeys.get(table)
    if (tableKey) resetTableWithStore(table, tableKey)
  }

  /** 渲染完成后调用：按当前文档的存档恢复列宽，并给每张表注入手柄 */
  function apply(): void {
    const docKey = currentDocKey()
    const duplicateCounts = new Map<string, number>()

    for (const table of tableElements()) {
      const cells = headerCells(table)
      // 合并单元格的表头无法与列一一对应，跳过以免错位分配列宽
      if (cells.length === 0 || cells.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1)) continue
      const headers = cells.map((cell) => (cell.textContent ?? '').trim())
      const hash = hashTableHeaders(headers)
      const duplicateIndex = duplicateCounts.get(hash) ?? 0
      duplicateCounts.set(hash, duplicateIndex + 1)
      const tableKey = buildTableKey(headers, duplicateIndex)
      tableKeys.set(table, tableKey)

      const saved = docKey ? widthStore.getLayout(docKey, tableKey) : null
      if (saved && saved.widths.length === headers.length) applyLayout(table, saved)
      else resetTable(table)
      ensureHandles(table)
    }
  }

  onBeforeUnmount(endDrag)

  return { apply }
}
