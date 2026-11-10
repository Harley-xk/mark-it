import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  peleRender: vi.fn(),
  mermaidInitialize: vi.fn(),
  mermaidRender: vi.fn()
}))

vi.mock('pele', () => ({
  render: mocks.peleRender
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mocks.mermaidInitialize,
    render: mocks.mermaidRender
  }
}))

describe('图表渲染调度', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('Pele 成功时不应加载 Mermaid', async () => {
    mocks.peleRender.mockReturnValue({
      svg: '<svg data-engine="pele"></svg>',
      type: 'flowchart'
    })
    const { getDiagramTheme } = await import('./diagram-theme')
    const { renderDiagramSvg } = await import('./diagram-renderer')

    const result = await renderDiagramSvg('flowchart TD\nA-->B', {
      diagramId: 'primary',
      theme: getDiagramTheme(false),
      fontFamily: 'Test Sans'
    })

    expect(result.engine).toBe('pele')
    expect(result.diagramType).toBe('flowchart')
    expect(mocks.mermaidRender).not.toHaveBeenCalled()
  })

  it('Pele 失败时应记录警告并回退 Mermaid 12 配置', async () => {
    mocks.peleRender.mockImplementation(() => {
      throw new Error('unsupported')
    })
    mocks.mermaidRender.mockResolvedValue({ svg: '<svg data-engine="mermaid"></svg>' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { getDiagramTheme } = await import('./diagram-theme')
    const { renderDiagramSvg } = await import('./diagram-renderer')

    const result = await renderDiagramSvg('sequenceDiagram\nA->>B: test', {
      diagramId: 'fallback',
      theme: getDiagramTheme(true),
      fontFamily: 'Test Sans'
    })

    expect(result.engine).toBe('mermaid')
    expect(warn).toHaveBeenCalledWith(
      'Pele diagram rendering failed, falling back to Mermaid:',
      expect.any(Error)
    )
    expect(mocks.mermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'base',
        look: 'neo',
        layout: 'elk',
        htmlLabels: false
      })
    )
    warn.mockRestore()
  })
})
