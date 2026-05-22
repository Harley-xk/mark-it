import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useAppStore } from '../stores/app'
import MarkdownIt from 'markdown-it'

export function usePdfExport() {
  const editor = useEditorStore()
  const app = useAppStore()
  const exporting = ref(false)

  const md = new MarkdownIt({ html: true, linkify: true, breaks: true })

  async function renderMermaidToSvg(html: string): Promise<string> {
    const container = document.createElement('div')
    container.innerHTML = html
    const blocks = container.querySelectorAll('code.language-mermaid')
    if (blocks.length === 0) return html

    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      })

      for (const block of blocks) {
        const parent = block.parentElement
        if (!parent || parent.tagName !== 'PRE') continue

        const id = `mermaid-pdf-${Math.random().toString(36).slice(2, 9)}`
        const code = block.textContent || ''
        try {
          const { svg } = await mermaid.render(id, code)
          const div = document.createElement('div')
          div.innerHTML = svg
          div.style.textAlign = 'center'
          div.style.margin = '1em 0'
          parent.replaceWith(div)
        } catch {
          // skip failed mermaid blocks
        }
      }
    } catch {
      // mermaid not available
    }

    return container.innerHTML
  }

  async function exportPdf(options: {
    pageSize: 'A4' | 'Letter'
    margin: 'narrow' | 'standard' | 'wide'
    showPageNumbers: boolean
  }) {
    exporting.value = true
    try {
      let htmlBody = md.render(editor.content)
      htmlBody = await renderMermaidToSvg(htmlBody)

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #222; line-height: 1.7; padding: 40px; max-width: 100%; }
  h1 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  h3 { font-size: 1.25em; }
  code { background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px 18px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 3px solid #ddd; padding: 0.5em 1em; color: #666; margin: 1em 0; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th { background: #f6f6f6; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #ddd; }
  td { padding: 6px 12px; border: 1px solid #ddd; }
  img { max-width: 100%; }
  a { color: #0366d6; }
  svg { max-width: 100%; height: auto; }
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