/**
 * 预览与 PDF 导出共用的 Mermaid 代码块识别逻辑。
 *
 * Mermaid 会根据代码内容自行判断图表类型，因此除了 `mermaid` 之外，
 * 也接受常见图表名作为代码块语言标记（```flowchart / ```sequence / ```classDiagram 等），
 * 并忽略大小写与 `-beta` / `-v2` 后缀（例如 xychart-beta、stateDiagram-v2）。
 */

const MERMAID_LANGUAGES = new Set([
  'mermaid',
  'mmd',
  // 流程图
  'flowchart',
  'flow',
  'graph',
  // 时序图 / 类图 / 状态图 / ER 图
  'sequence',
  'sequencediagram',
  'class',
  'classdiagram',
  'state',
  'statediagram',
  'er',
  'erdiagram',
  // 项目计划类
  'gantt',
  'journey',
  'timeline',
  // 思维导图 / 饼图 / Git 分支图
  'mindmap',
  'pie',
  'gitgraph',
  // 数据图表
  'quadrantchart',
  'xychart',
  'sankey',
  'radar',
  'treemap',
  // 其他 Mermaid 图表
  'block',
  'blockdiagram',
  'packet',
  'requirement',
  'requirementdiagram',
  'architecture',
  'kanban',
  'info'
])

const LANGUAGE_CLASS_PREFIX = 'language-'
/** xychart-beta、sankey-beta、stateDiagram-v2 之类写法，去掉版本后缀后再匹配 */
const VERSION_SUFFIX = /-(?:beta|v2)$/i

function normalizeLanguage(language: string): string {
  return language.toLowerCase().replace(VERSION_SUFFIX, '')
}

/** 判断语言标记是否应交给 Mermaid 渲染 */
function isMermaidLanguage(language: string): boolean {
  const normalized = normalizeLanguage(language)
  if (MERMAID_LANGUAGES.has(normalized)) return true
  // C4 系列：C4Context / C4Container / C4Component / C4Dynamic / C4Deployment
  return /^c4[a-z]*$/.test(normalized)
}

/** 取出代码块的语言标记（如 flowchart、sequenceDiagram）；不是 Mermaid 块时返回 null */
export function getMermaidLanguage(el: Element): string | null {
  for (const className of el.classList) {
    if (!className.startsWith(LANGUAGE_CLASS_PREFIX)) continue
    const language = className.slice(LANGUAGE_CLASS_PREFIX.length)
    if (isMermaidLanguage(language)) return language
  }
  return null
}

/** 判断 <code> 元素是否为需要交给 Mermaid 渲染的代码块 */
export function isMermaidCodeBlock(el: Element): boolean {
  return getMermaidLanguage(el) !== null
}

/** 收集容器内所有 Mermaid 代码块（markdown-it 渲染为 <pre><code class="language-xxx">） */
export function collectMermaidBlocks(root: ParentNode): HTMLElement[] {
  const blocks = root.querySelectorAll<HTMLElement>('code[class*="language-"]')
  return Array.from(blocks).filter(isMermaidCodeBlock)
}

/** 从 mermaid 抛出的异常中提取一行可读的失败原因 */
export function formatMermaidError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return '未知错误'

  // mermaid 的语法错误通常是「Parse error on line N: + 源码行 + 指示符 + Expecting ...」，
  // 这里只保留错误行与 got 到的 token，完整内容放在 title 里
  const first = lines[0].replace(/:\s*$/, '')
  const got = message.match(/got '([^']+)'/)
  return got ? `${first}（got '${got[1]}'）` : first
}
