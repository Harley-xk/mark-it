/**
 * 启动时会话恢复的就绪信号。
 * 恢复逻辑会用会话内容整体替换标签页，若用户恰好在这期间打开文件，
 * 新文档会被覆盖——打开动作需要等待恢复完成。
 */

let resolveReady: (() => void) | null = null

const ready = new Promise<void>((resolve) => {
  resolveReady = resolve
})

/** 会话恢复（或确认无需恢复）完成 */
export function markSessionReady(): void {
  resolveReady?.()
  resolveReady = null
}

/** 等待启动时的会话恢复完成 */
export function whenSessionReady(): Promise<void> {
  return ready
}
