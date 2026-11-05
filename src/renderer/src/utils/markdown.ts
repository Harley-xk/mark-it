/*
 * 作者: Harley-xk
 * 创建: 2026-11-05
 *
 * 描述: 创建带 GitHub 规范扩展（任务列表）的 markdown-it 实例，供预览与 PDF 共用
 */
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'

export interface MarkdownRendererOptions {
  /** 排版替换（引号、破折号等）；预览默认开启，PDF 保持关闭 */
  typographer?: boolean
}

/**
 * 对已知语言做语法高亮；未知语言返回空串，交给 markdown-it 按纯文本转义。
 * Mermaid 等自定义代码块不在 highlight.js 的语言表里，因此会原样保留，
 * 不影响后续的图表识别与渲染。
 */
function highlightCode(code: string, language: string): string {
  const lang = language.trim().toLowerCase()
  if (!lang || !hljs.getLanguage(lang)) return ''

  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  } catch (err) {
    console.warn('Failed to highlight code block:', lang, err)
    return ''
  }
}

/**
 * 预览与 PDF 共用的渲染器工厂。
 * markdown-it 默认已支持表格、删除线与链接自动识别，这里补充 GitHub 任务列表
 * （输出 contains-task-list / task-list-item / task-list-item-checkbox）与
 * highlight.js 语法高亮，保证内置主题和导入的 GitHub 系 CSS 都能正确命中。
 */
export function createMarkdownRenderer(options: MarkdownRendererOptions = {}): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: options.typographer ?? false,
    breaks: true,
    highlight: highlightCode
  })

  md.use(taskLists)

  return md
}
