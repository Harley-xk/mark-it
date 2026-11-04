/** 主进程与渲染进程共用的会话（上次打开的标签页）类型（纯类型，无运行时依赖） */

export interface SessionTab {
  /** 文件路径；从未保存过的新建文档为 null */
  path: string | null
  name: string
  /** 文档内容，统一使用 LF 换行 */
  content: string
  isModified: boolean
  cursorLine: number
  cursorCol: number
  /** 原文件换行符；缺失时按 LF 处理（兼容旧会话） */
  eol?: '\n' | '\r\n'
  /** 原文件是否带 UTF-8 BOM；缺失时按 false 处理（兼容旧会话） */
  bom?: boolean
}

export interface SessionData {
  tabs: SessionTab[]
  /** 激活标签在 tabs 中的下标 */
  activeIndex: number
}
