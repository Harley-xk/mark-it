/** 主进程与渲染进程共用的自动更新状态类型（纯类型，无运行时依赖） */

export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  latestVersion?: string
  notes?: string
  forceUpdate: boolean
  progress?: UpdateProgress
  error?: string
}
