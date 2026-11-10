import { describe, expect, it } from 'vitest'
import { buildMermaidConfig, buildPeleThemeVariables, getDiagramTheme } from './diagram-theme'

describe('图表主题 token', () => {
  it('深浅主题均提供完整的八个系列色', () => {
    for (const theme of [getDiagramTheme(false), getDiagramTheme(true)]) {
      expect(theme.series).toHaveLength(8)
      expect(theme.series.every((color) => color.startsWith('#'))).toBe(true)
    }
  })

  it('Pele 变量应覆盖画布、节点和系列色', () => {
    const theme = getDiagramTheme(true)
    const variables = buildPeleThemeVariables(theme, 'Test Sans')

    expect(variables['--pele-bg']).toBe(theme.background)
    expect(variables['--pele-surface']).toBe(theme.surface)
    expect(variables['--pele-font']).toBe('Test Sans')
    expect(variables['--pele-series-8']).toBe(theme.series[7])
  })

  it('Mermaid 配置应固定使用 ELK、Neo 和自然尺寸', () => {
    const theme = getDiagramTheme(false)
    const config = buildMermaidConfig(theme, 'Test Sans')

    expect(config.theme).toBe('base')
    expect(config.look).toBe('neo')
    expect(config.layout).toBe('elk')
    expect(config.htmlLabels).toBe(false)
    expect(config.flowchart?.useMaxWidth).toBe(false)
    expect(config.sequence?.useMaxWidth).toBe(false)
    expect(config.themeVariables.background).toBe(theme.background)
  })
})
