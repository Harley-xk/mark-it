declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it'

  interface TaskListOptions {
    /** 复选框是否可交互；默认 false，输出带 enabled 类名的可勾选清单 */
    enabled?: boolean
    /** 是否用 <label> 包裹清单文本 */
    label?: boolean
    /** 是否把 <label> 放在清单文本之后 */
    labelAfter?: boolean
  }

  const taskLists: (md: MarkdownIt, options?: TaskListOptions) => void
  export default taskLists
}
