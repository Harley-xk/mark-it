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

/** 更新通道：stable 为正式版，beta 为预发布版 */
export type UpdateChannel = 'stable' | 'beta'

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  /** 当前运行版本所属通道（版本号含预发布后缀即为 beta） */
  currentChannel: UpdateChannel
  /** 是否接收 Beta 版更新 */
  betaUpdatesEnabled: boolean
  latestVersion?: string
  /** 本次提供的更新来自哪个通道；无可用更新时为空 */
  latestChannel?: UpdateChannel
  /** 当前回退流程（含检测、下载、已下载或可重试错误）是否由用户主动发起 */
  isRollback?: boolean
  notes?: string
  forceUpdate: boolean
  progress?: UpdateProgress
  error?: string
}
