/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 统一调度 Pele 与 Mermaid 图表渲染，并在 Pele 失败时自动回退
 */
import type { MermaidConfig } from 'mermaid'
import { buildMermaidConfig, type DiagramThemeTokens } from './diagram-theme'

export type DiagramEngine = 'pele' | 'mermaid'

export interface DiagramRenderOptions {
  diagramId: string
  theme: DiagramThemeTokens
  fontFamily: string
  fontSize?: number
}

export interface DiagramRenderResult {
  svg: string
  engine: DiagramEngine
  diagramType?: string
}

let peleModulePromise: Promise<typeof import('pele')> | null = null
let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null
let mermaidConfigKey = ''
let mermaidRenderChain: Promise<void> = Promise.resolve()

function loadPele(): Promise<typeof import('pele')> {
  peleModulePromise ??= import('pele')
  return peleModulePromise
}

function loadMermaid(): Promise<typeof import('mermaid')> {
  mermaidModulePromise ??= import('mermaid')
  return mermaidModulePromise
}

function normalizeDiagramId(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return normalized || `diagram-${Date.now()}`
}

function configKey(config: MermaidConfig): string {
  return JSON.stringify(config)
}

async function renderWithPele(
  source: string,
  options: DiagramRenderOptions
): Promise<DiagramRenderResult> {
  const { render } = await loadPele()
  const result = render(source, {
    idPrefix: normalizeDiagramId(options.diagramId),
    fontFamily: options.fontFamily,
    fontSize: options.fontSize ?? 16,
    responsive: false,
    autoDirection: false,
    links: true,
    linkSchemes: ['http', 'https', 'mailto'],
    linkRel: 'noopener noreferrer',
    images: false
  })

  if (!result.svg) throw new Error('Pele returned an empty SVG')
  return {
    svg: result.svg,
    engine: 'pele',
    diagramType: result.type
  }
}

async function renderWithMermaid(
  source: string,
  options: DiagramRenderOptions
): Promise<DiagramRenderResult> {
  const config = buildMermaidConfig(options.theme, options.fontFamily)
  const nextConfigKey = configKey(config)
  const diagramId = normalizeDiagramId(options.diagramId)

  const run = mermaidRenderChain.then(async () => {
    const mermaid = (await loadMermaid()).default
    if (nextConfigKey !== mermaidConfigKey) {
      mermaid.initialize(config)
      mermaidConfigKey = nextConfigKey
    }
    const { svg } = await mermaid.render(diagramId, source)
    if (!svg) throw new Error('Mermaid returned an empty SVG')
    return { svg, engine: 'mermaid' as const }
  })

  mermaidRenderChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function renderDiagramSvg(
  source: string,
  options: DiagramRenderOptions
): Promise<DiagramRenderResult> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready
  }

  try {
    return await renderWithPele(source, options)
  } catch (err) {
    console.warn('Pele diagram rendering failed, falling back to Mermaid:', err)
  }

  return renderWithMermaid(source, options)
}
