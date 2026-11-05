import { ref, type Ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useDocumentsStore } from '../stores/documents'
import { useAppStore } from '../stores/app'
import { collectMermaidBlocks, formatMermaidError } from '../utils/mermaid'
import { parseFrontmatter, renderFrontmatterTable } from '../utils/frontmatter'
import { installLocalImageRule } from '../utils/local-image'
import { installHeadingAnchors, parseHeadings, type ParsedHeading } from '../utils/headings'
import { createMarkdownRenderer } from '../utils/markdown'
import type { PdfExportOptions } from '../types'

interface UsePdfExport {
  exporting: Ref<boolean>
  exportPdf: (options: PdfExportOptions) => Promise<void>
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** 生成 PDF 目录；锚点由 installHeadingAnchors 注入，阅读器可据此跳转 */
function renderToc(headings: ParsedHeading[]): string {
  if (headings.length === 0) return ''

  const items = headings
    .map(
      (heading) =>
        `<li class="toc-level-${heading.level}"><a href="#${heading.id}">` +
        `${escapeHtml(heading.text)}</a></li>`
    )
    .join('')

  return (
    '<nav class="pdf-toc">' +
    '<div class="pdf-toc-title">目录</div>' +
    `<ul>${items}</ul>` +
    '</nav>'
  )
}

export function usePdfExport(): UsePdfExport {
  const editor = useEditorStore()
  const documents = useDocumentsStore()
  const app = useAppStore()
  const exporting = ref(false)

  const md = createMarkdownRenderer()
  // 与预览一致：标题按文档顺序注入 heading-N 锚点
  installHeadingAnchors(md)

  // 与预览一致：相对路径图片按当前文档目录解析
  installLocalImageRule(md, () => documents.activeDoc?.path)

  async function renderMermaidToSvg(html: string): Promise<string> {
    const container = document.createElement('div')
    container.innerHTML = html
    const blocks = collectMermaidBlocks(container)
    if (blocks.length === 0) return html

    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        // 与预览一致：标签用 SVG <text>，避免 foreignObject 在 PDF 中显示异常
        htmlLabels: false
      })

      for (const block of blocks) {
        const parent = block.parentElement
        if (!parent || parent.tagName !== 'PRE') continue

        const id = `mermaid-pdf-${Math.random().toString(36).slice(2, 9)}`
        const code = block.textContent || ''
        try {
          const { svg } = await mermaid.render(id, code)
          const div = document.createElement('div')
          div.className = 'mermaid-container'
          div.innerHTML = svg
          parent.replaceWith(div)
        } catch (err) {
          // 单块失败：保留原始代码块，并追加可见提示，避免用户不知道图为何丢失
          console.error('Failed to render Mermaid in PDF:', err)
          const notice = document.createElement('div')
          notice.className = 'mermaid-error'
          notice.textContent = `图表渲染失败：${formatMermaidError(err)}`
          parent.classList.add('mermaid-error-source')
          parent.after(notice)
        }
      }
    } catch (err) {
      // 动态导入或初始化失败：所有图表退化为代码块，同时保留日志便于排查
      console.error('Failed to initialize Mermaid for PDF:', err)
    }

    return container.innerHTML
  }

  async function exportPdf(options: PdfExportOptions): Promise<void> {
    // 防重入：导出期间忽略再次触发（对话框同时会禁用按钮）
    if (exporting.value) return
    exporting.value = true
    try {
      // 与预览保持一致：frontmatter 渲染为文档信息表格，不输出原始 YAML
      const { entries, body } = parseFrontmatter(editor.content)
      const frontmatter = entries.length > 0 ? renderFrontmatterTable(entries) : ''
      const toc = options.showToc ? renderToc(parseHeadings(body)) : ''
      let htmlBody = toc + frontmatter + md.render(body)
      htmlBody = await renderMermaidToSvg(htmlBody)

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #222; line-height: 1.7; margin: 0; padding: 0; max-width: 100%; }
  h1 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  h3 { font-size: 1.25em; }
  code { background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px 18px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  .hljs-comment, .hljs-quote { color: #6e7781; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-template-tag, .hljs-template-variable { color: #cf222e; }
  .hljs-string, .hljs-regexp, .hljs-meta .hljs-string { color: #0a3069; }
  .hljs-number, .hljs-literal, .hljs-variable, .hljs-attr, .hljs-attribute, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: #0550ae; }
  .hljs-title, .hljs-section { color: #8250df; font-weight: 600; }
  .hljs-built_in, .hljs-type, .hljs-name, .hljs-tag { color: #953800; }
  .hljs-meta, .hljs-symbol, .hljs-bullet, .hljs-link { color: #6e7781; }
  blockquote { border-left: 3px solid #ddd; padding: 0.5em 1em; color: #666; margin: 1em 0; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th { background: #f6f6f6; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #ddd; }
  td { padding: 6px 12px; border: 1px solid #ddd; }
  .task-list-item { list-style-type: none; }
  .task-list-item-checkbox { margin: 0 0.2em 0.25em -1.4em; vertical-align: middle; }
  .frontmatter-title { font-size: 12px; color: #666; margin-bottom: 6px; }
  .frontmatter-table .fm-key { width: 160px; color: #555; font-family: Consolas, monospace; font-size: 12px; }
  .frontmatter-table .fm-value { white-space: pre-wrap; word-break: break-word; }
  .pdf-toc { break-after: page; }
  .pdf-toc-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
  .pdf-toc ul { list-style: none; padding: 0; margin: 0; }
  .pdf-toc li { margin: 3px 0; font-size: 13px; }
  .pdf-toc .toc-level-2 { padding-left: 16px; }
  .pdf-toc .toc-level-3 { padding-left: 32px; }
  .pdf-toc .toc-level-4 { padding-left: 48px; }
  .pdf-toc .toc-level-5 { padding-left: 64px; }
  .pdf-toc .toc-level-6 { padding-left: 80px; }
  img { max-width: 100%; }
  a { color: #0366d6; }
  svg { max-width: 100%; height: auto; }
  .mermaid-container { text-align: center; margin: 1em 0; break-inside: avoid; page-break-inside: avoid; }
  .mermaid-error { margin: 0.5em 0 1em; padding: 6px 10px; border-left: 3px solid #d9534f; background: #fdf2f2; color: #a94442; font-size: 12px; }
  .mermaid-error-source { opacity: 0.75; }
  /* 分页控制：标题后不孤行，段落保留首尾行，表格按行与表头分页 */
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  p { orphans: 3; widows: 3; }
  pre, blockquote, img { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>${htmlBody}</body>
</html>`

      const filePath = await window.api.exportPdf(html, options)
      if (filePath) {
        app.showPdfDialog = false
      }
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportPdf }
}
