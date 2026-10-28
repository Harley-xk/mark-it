/** 主进程与渲染进程共用的会话（上次打开的标签页）类型（纯类型，无运行时依赖） */

export interface SessionTab {
  /** 文件路径；从未保存过的新建文档为 null */
  path: string | null
  name: string
  content: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
}

export interface SessionData {
  tabs: SessionTab[]
  /** 激活标签在 tabs 中的下标 */
  activeIndex: number
}
