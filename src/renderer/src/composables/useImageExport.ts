/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 按图片导出设置生成当前文档长图，并交给主进程截图
 */

import { ref, type Ref } from 'vue'
import type { ImageExportOptions } from '../types'
import { useAppStore } from '../stores/app'
import { useDocumentsStore } from '../stores/documents'
import { useEditorStore } from '../stores/editor'
import { useStyleStore } from '../stores/style'
import { getDiagramTheme } from '../utils/diagram-theme'
import { renderMermaidDiagramsForExport } from '../utils/export-markdown'
import { parseFrontmatter, renderFrontmatterTable } from '../utils/frontmatter'
import { installHeadingAnchors } from '../utils/headings'
import { normalizeImageExportSettings } from '../utils/image-export-settings'
import { installLinkTitles } from '../utils/link-title'
import { installLocalImageRule } from '../utils/local-image'
import { createMarkdownRenderer } from '../utils/markdown'
import imageExportCss from '../styles/export/image-export.css?raw'

interface UseImageExport {
  exporting: Ref<boolean>
  exportImage: (options: ImageExportOptions) => Promise<void>
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

  async function exportImage(options: ImageExportOptions): Promise<void> {
    if (exporting.value || app.exportStatus === 'exporting') return

    const doc = documents.activeDoc
    if (!doc) return

    const settings = normalizeImageExportSettings(options)
    const theme = settings.theme === 'preview' ? app.resolvedTheme : settings.theme
    const isDark = theme === 'dark'
    const background = isDark ? '#121218' : '#ffffff'
    const canvasWidth = settings.contentWidth + 80

    exporting.value = true
    app.setExportStatus('image', 'exporting')
    app.setExportProgress('image', 2, '准备内容')
    const requestId = `image-${crypto.randomUUID()}`
    const stopProgress = window.api.onExportProgress((progress) => {
      if (progress.requestId !== requestId || progress.kind !== 'image') return
      app.setExportProgress('image', progress.percent, progress.stage)
    })
    try {
      app.setExportProgress('image', 4, '整理文档')
      const { entries, body } = parseFrontmatter(editor.content)
      const frontmatter =
        settings.includeFrontmatter && entries.length > 0 ? renderFrontmatterTable(entries) : ''
      const currentStyleId = styles.currentStyle(isDark).id
      const fontFamily =
        currentStyleId === 'academic'
          ? "'Georgia', 'Times New Roman', serif"
          : "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"

      let htmlBody = frontmatter + md.render(body)
      app.setExportProgress('image', 6, '渲染图表')
      htmlBody = await renderMermaidDiagramsForExport(htmlBody, {
        theme: getDiagramTheme(isDark),
        fontFamily,
        containerClass: 'mermaid-diagram',
        diagramIdPrefix: 'mermaid-image',
        failureLogLabel: 'Failed to render diagram in image export:'
      })

      const themeCss = escapeStyleContent(styles.currentCss(isDark))
      const html = `<!DOCTYPE html>
<html
  lang="zh-CN"
  style="--image-content-width: ${settings.contentWidth}px; --image-canvas-width: ${canvasWidth}px; --image-background: ${background}"
>
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

      app.setExportProgress('image', 8, '生成导出页面')
      const result = await window.api.exportImage(html, { ...options, ...settings }, requestId)
      if (!result) {
        app.setExportStatus('image', 'idle')
        return
      }

      const detail =
        result.appliedScale < result.requestedScale ? `已自动降至 ${result.appliedScale}×` : ''
      app.setExportStatus('image', 'success', detail)
    } catch (err) {
      app.setExportStatus('image', 'error')
      throw err
    } finally {
      stopProgress()
      exporting.value = false
    }
  }

  return { exporting, exportImage }
}
