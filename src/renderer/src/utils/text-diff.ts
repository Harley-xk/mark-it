/**
 * 轻量行级差异（LCS），仅用于文件冲突提示。
 * 大文件退化为「整段删除 + 整段新增」，避免 O(n*m) 占用过多内存。
 */

export interface DiffLine {
  /** add = 仅本地有；remove = 仅磁盘有；context = 相同；gap = 折叠的相同行 */
  type: 'add' | 'remove' | 'context' | 'gap'
  text: string
  /** gap 行被折叠的行数 */
  count?: number
}

const MAX_LCS_CELLS = 4_000_000
const CONTEXT_LINES = 3

type OpType = 'equal' | 'add' | 'remove'
interface Op {
  type: OpType
  text: string
}

/** 统一换行符，避免 CRLF 被当成逐行差异 */
function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)

  for (let i = n - 1; i >= 0; i--) {
    const row = i * width
    const next = (i + 1) * width
    for (let j = m - 1; j >= 0; j--) {
      dp[row + j] = a[i] === b[j] ? dp[next + j + 1] + 1 : Math.max(dp[next + j], dp[row + j + 1])
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] })
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: 'remove', text: a[i] })
      i += 1
    } else {
      ops.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) ops.push({ type: 'remove', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

/**
 * 生成 oldText（磁盘）与 newText（本地）之间的差异列表。
 * 相同行超过上下文范围时会折叠成 gap 行。
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = normalize(oldText).split('\n')
  const newLines = normalize(newText).split('\n')

  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix)
  const newMid = newLines.slice(prefix, newLines.length - suffix)
  const middle: Op[] =
    oldMid.length * newMid.length <= MAX_LCS_CELLS
      ? lcsOps(oldMid, newMid)
      : [
          ...oldMid.map<Op>((text) => ({ type: 'remove', text })),
          ...newMid.map<Op>((text) => ({ type: 'add', text }))
        ]

  const ops: Op[] = [
    ...oldLines.slice(0, prefix).map<Op>((text) => ({ type: 'equal', text })),
    ...middle,
    ...oldLines.slice(oldLines.length - suffix).map<Op>((text) => ({ type: 'equal', text }))
  ]

  const result: DiffLine[] = []
  let contextRun: string[] = []

  const flushContext = (): void => {
    if (contextRun.length === 0) return
    if (contextRun.length <= CONTEXT_LINES * 2 + 1) {
      for (const text of contextRun) result.push({ type: 'context', text })
    } else {
      for (const text of contextRun.slice(0, CONTEXT_LINES)) {
        result.push({ type: 'context', text })
      }
      result.push({
        type: 'gap',
        text: '',
        count: contextRun.length - CONTEXT_LINES * 2
      })
      for (const text of contextRun.slice(-CONTEXT_LINES)) {
        result.push({ type: 'context', text })
      }
    }
    contextRun = []
  }

  for (const op of ops) {
    if (op.type === 'equal') {
      contextRun.push(op.text)
      continue
    }
    flushContext()
    result.push({ type: op.type, text: op.text })
  }
  flushContext()

  return result
}
