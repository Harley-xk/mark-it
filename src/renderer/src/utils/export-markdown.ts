/*
 * 作者: Harley-xk
 * 创建: 2026-11-11
 *
 * 描述: 将导出 HTML 中的 Mermaid 代码块替换为静态 SVG，供 PDF 与长图共用
 */

import { buildPeleThemeVariables, type DiagramThemeTokens } from './diagram-theme'
import { renderDiagramSvg } from './diagram-renderer'
import { collectMermaidBlocks, formatMermaidError } from './mermaid'

export interface ExportMermaidOptions {
  theme: DiagramThemeTokens
  fontFamily: string
  containerClass: string
  diagramIdPrefix: string
  failureLogLabel: string
}

export async function renderMermaidDiagramsForExport(
  html: string,
  options: ExportMermaidOptions
): Promise<string> {
  const container = document.createElement('div')
  container.innerHTML = html
  const blocks = collectMermaidBlocks(container)
  if (blocks.length === 0) return html

  if (document.fonts) {
    try {
      await document.fonts.ready
    } catch (err) {
      console.warn('Failed to wait for export fonts:', err)
    }
  }

  const themeVariables = buildPeleThemeVariables(options.theme, options.fontFamily)
  for (const block of blocks) {
    const parent = block.parentElement
    if (!parent || parent.tagName !== 'PRE') continue

    const id = `${options.diagramIdPrefix}-${Math.random().toString(36).slice(2, 9)}`
    const code = block.textContent || ''
    try {
      const result = await renderDiagramSvg(code, {
        diagramId: id,
        theme: options.theme,
        fontFamily: options.fontFamily,
        fontSize: 16
      })
      const diagram = document.createElement('div')
      diagram.className = `${options.containerClass} export-mermaid-diagram`
      diagram.dataset.diagramEngine = result.engine
      diagram.style.background = options.theme.background
      for (const [name, value] of Object.entries(themeVariables)) {
        diagram.style.setProperty(name, value)
      }
      diagram.innerHTML = result.svg
      parent.replaceWith(diagram)
    } catch (err) {
      console.error(options.failureLogLabel, err)
      const notice = document.createElement('div')
      notice.className = 'mermaid-error'
      notice.textContent = `图表渲染失败：${formatMermaidError(err)}`
      parent.classList.add('mermaid-error-source')
      parent.after(notice)
    }
  }

  return container.innerHTML
}
