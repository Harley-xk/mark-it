import { onUnmounted, watch } from 'vue'
import { useDocumentsStore } from '../stores/documents'
import { useFile } from './useFile'
import { normalizePath, samePath } from '../utils/path'

type DiskChange = { path: string; content: string }

function pathKey(filePath: string): string {
  return normalizePath(filePath)
}

/**
 * 把「手动刷新」改为被动刷新：
 * 1. 当前活跃标签对应的磁盘文件由主进程监视，外部修改后自动同步；
 * 2. 切换到非活跃标签时主动读取一次磁盘，之后继续按第 1 条运行；
 * 3. 切换标签时主进程随即改为监视新标签的文件，旧文件不再产生事件。
 *
 * 磁盘与本地都有修改时的处理见 useFile.reconcileDiskContent。
 */
export function useFileWatcher(): void {
  const docs = useDocumentsStore()
  const file = useFile()

  /** 待处理的磁盘变更；同一文件只保留最新一次，避免连续写入时堆积弹窗 */
  const queue: DiskChange[] = []
  let draining = false
  /** 标签切换序号，避免快速切换时旧路径的读取结果被应用 */
  let switchSeq = 0

  /**
   * 每个文件路径的代次：读取开始、收到外部事件都会推进。
   * 异步读取完成时代次已变化说明期间有更新的数据，直接丢弃，
   * 避免「激活时读到的旧内容」覆盖刚推送的新内容。
   */
  const generations = new Map<string, number>()

  function bumpGeneration(filePath: string): number {
    const key = pathKey(filePath)
    const next = (generations.get(key) ?? 0) + 1
    generations.set(key, next)
    return next
  }

  function enqueue(change: DiskChange): void {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (samePath(queue[i].path, change.path)) queue.splice(i, 1)
    }
    queue.push(change)
    void drain()
  }

  /** 串行处理变更：冲突确认框在解决前不会叠加弹出 */
  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      while (queue.length > 0) {
        const change = queue.shift()!
        // 应用前再次确认：等待期间用户可能已经切换走
        const doc = docs.activeDoc
        if (!doc?.path || !samePath(doc.path, change.path)) continue
        await file.applyExternalContent(change)
      }
    } finally {
      draining = false
    }
  }

  /** 切换过去时补读一次：非活跃期间没有监视，磁盘可能已经变化 */
  async function refreshPath(filePath: string): Promise<void> {
    const generation = bumpGeneration(filePath)
    const result = await window.api.readFile(filePath)
    // 读取期间收到同一文件的新事件 / 又发起了新的读取：以更新的一方为准
    if (!result || generations.get(pathKey(filePath)) !== generation) return

    const doc = docs.activeDoc
    if (!doc?.path || !samePath(doc.path, filePath)) return
    enqueue({ path: doc.path, content: result.content })
  }

  const offExternalChange = window.api.onExternalFileChange((change) => {
    bumpGeneration(change.path)
    const doc = docs.activeDoc
    if (!doc?.path || !samePath(doc.path, change.path)) return
    enqueue(change)
  })

  // 活跃标签路径变化 = 切换标签 / 另存为 / 切到新建文档：
  // 旧文件立即注销监视，新文件注册监视并主动补读一次
  watch(
    () => docs.activeDoc?.path ?? null,
    (path) => {
      const seq = ++switchSeq
      void (async () => {
        await window.api.watchFile(path)
        if (seq !== switchSeq) return

        if (!path) {
          // 切到未保存的新文档：旧文件的待处理变更不再有意义
          queue.length = 0
          return
        }

        const doc = docs.activeDoc
        if (!doc?.path || !samePath(doc.path, path)) return
        await refreshPath(path)
      })()
    },
    { immediate: true }
  )

  onUnmounted(() => {
    offExternalChange()
    void window.api.watchFile(null)
  })
}
