/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 将当前文档按预览主题渲染为自包含 HTML，并交给主进程导出长图
 */

import { ref, type Ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useDocumentsStore } from '../stores/documents'
import { useEditorStore } from '../stores/editor'
import { useStyleStore } from '../stores/style'
import { getDiagramTheme } from '../utils/diagram-theme'
import { renderMermaidDiagramsForExport } from '../utils/export-markdown'
import { parseFrontmatter, renderFrontmatterTable } from '../utils/frontmatter'
import { installHeadingAnchors } from '../utils/headings'
import { installLinkTitles } from '../utils/link-title'
import { installLocalImageRule } from '../utils/local-image'
import { createMarkdownRenderer } from '../utils/markdown'
import { deriveImageFileName } from '../utils/pdf-name'
import imageExportCss from '../styles/export/image-export.css?raw'

interface UseImageExport {
  exporting: Ref<boolean>
  exportImage: () => Promise<void>
}

function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style')
}

export function useImageExport(): UseImageExport {
  const app = useAppStore()
  const documents = useDocumentsStore()
  const editor = useEditorStore()
  const styles = useStyleStore()
  const exporting = ref(false)

  const md = createMarkdownRenderer({ typographer: true })
  installLocalImageRule(md, () => documents.activeDoc?.path)
  installHeadingAnchors(md)
  installLinkTitles(md)

  async function exportImage(): Promise<void> {
    if (exporting.value || app.exportStatus === 'exporting') return

    const doc = documents.activeDoc
    if (!doc) return

    exporting.value = true
    app.setExportStatus('image', 'exporting')
    try {
      const { entries, body } = parseFrontmatter(editor.content)
      const frontmatter = entries.length > 0 ? renderFrontmatterTable(entries) : ''
      const theme = app.resolvedTheme
      const isDark = theme === 'dark'
      const currentStyleId = styles.currentStyle(isDark).id
      const fontFamily =
        currentStyleId === 'academic'
          ? "'Georgia', 'Times New Roman', serif"
          : "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"

      let htmlBody = frontmatter + md.render(body)
      htmlBody = await renderMermaidDiagramsForExport(htmlBody, {
        theme: getDiagramTheme(isDark),
        fontFamily,
        containerClass: 'mermaid-diagram',
        diagramIdPrefix: 'mermaid-image',
        failureLogLabel: 'Failed to render diagram in image export:'
      })

      const themeCss = escapeStyleContent(styles.currentCss(isDark))
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>${themeCss}</style>
<style>${imageExportCss}</style>
</head>
<body class="${theme}">
<main class="image-export-page">
<div class="preview-content markdown-body">${htmlBody}</div>
</main>
</body>
</html>`

      const filePath = await window.api.exportImage(html, {
        scale: 2,
        fileName: deriveImageFileName(doc.name),
        sourcePath: doc.path
      })
      app.setExportStatus('image', filePath ? 'success' : 'idle')
    } catch (err) {
      app.setExportStatus('image', 'error')
      throw err
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportImage }
}
