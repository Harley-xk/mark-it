/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 提供图表渲染的深浅色 token、Mermaid 配置与 Pele CSS 变量映射
 */
import type { MermaidConfig } from 'mermaid'

export type DiagramColorMode = 'light' | 'dark'

export interface DiagramThemeTokens {
  mode: DiagramColorMode
  background: string
  foreground: string
  muted: string
  line: string
  surface: string
  surfaceAlt: string
  border: string
  accent: string
  critical: string
  series: readonly string[]
}

const LIGHT_THEME: DiagramThemeTokens = {
  mode: 'light',
  background: '#ffffff',
  foreground: '#1f2937',
  muted: '#667085',
  line: '#7b8798',
  surface: '#eef4ff',
  surfaceAlt: '#e2eaf8',
  border: '#c7d2e3',
  accent: '#2563eb',
  critical: '#dc2626',
  series: ['#2563eb', '#7c3aed', '#0f766e', '#d97706', '#db2777', '#65a30d', '#0891b2', '#e11d48']
}

const DARK_THEME: DiagramThemeTokens = {
  mode: 'dark',
  background: '#0d1117',
  foreground: '#e6edf3',
  muted: '#9fb0c4',
  line: '#8b9bb4',
  surface: '#123252',
  surfaceAlt: '#1a2d45',
  border: '#38536f',
  accent: '#58a6ff',
  critical: '#f85149',
  series: ['#4c8dff', '#a78bfa', '#2dd4bf', '#f59e0b', '#f472b6', '#84cc16', '#38bdf8', '#fb7185']
}

const DIAGRAM_THEMES: Record<DiagramColorMode, DiagramThemeTokens> = {
  light: LIGHT_THEME,
  dark: DARK_THEME
}

const MONO_FONT = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

export function getDiagramTheme(isDark: boolean): DiagramThemeTokens {
  return isDark ? DIAGRAM_THEMES.dark : DIAGRAM_THEMES.light
}

function seriesColor(theme: DiagramThemeTokens, index: number): string {
  return theme.series[index % theme.series.length] ?? theme.accent
}

function buildMermaidThemeVariables(
  theme: DiagramThemeTokens,
  fontFamily: string
): Record<string, string> {
  const variables: Record<string, string> = {
    background: theme.background,
    fontFamily,
    fontSize: '16px',
    primaryColor: theme.surface,
    primaryTextColor: theme.foreground,
    primaryBorderColor: theme.border,
    secondaryColor: theme.surfaceAlt,
    secondaryTextColor: theme.foreground,
    secondaryBorderColor: theme.border,
    tertiaryColor: theme.background,
    tertiaryTextColor: theme.foreground,
    tertiaryBorderColor: theme.border,
    textColor: theme.foreground,
    titleColor: theme.foreground,
    lineColor: theme.line,
    arrowheadColor: theme.line,
    mainBkg: theme.surface,
    nodeBkg: theme.surface,
    nodeBorder: theme.border,
    nodeTextColor: theme.foreground,
    clusterBkg: theme.surfaceAlt,
    clusterBorder: theme.border,
    edgeLabelBackground: theme.background,
    actorBkg: theme.surface,
    actorBorder: theme.border,
    actorTextColor: theme.foreground,
    actorLineColor: theme.line,
    signalColor: theme.line,
    signalTextColor: theme.foreground,
    labelBoxBkgColor: theme.surfaceAlt,
    labelBoxBorderColor: theme.border,
    labelTextColor: theme.foreground,
    loopTextColor: theme.foreground,
    noteBkgColor: theme.surfaceAlt,
    noteBorderColor: theme.border,
    noteTextColor: theme.foreground,
    sectionBkgColor: theme.surfaceAlt,
    sectionBkgColor2: theme.surface,
    taskBkgColor: theme.surface,
    taskBorderColor: theme.border,
    taskTextColor: theme.foreground,
    taskTextOutsideColor: theme.foreground,
    activeTaskBkgColor: theme.surface,
    activeTaskBorderColor: theme.accent,
    doneTaskBkgColor: theme.surfaceAlt,
    doneTaskBorderColor: theme.border,
    critBkgColor: theme.critical,
    critBorderColor: theme.critical,
    pieTitleTextColor: theme.foreground,
    pieSectionTextColor: theme.foreground,
    pieLegendTextColor: theme.foreground,
    pieStrokeColor: theme.background,
    pieOuterStrokeColor: theme.background
  }

  for (let index = 0; index < 12; index++) {
    const color = seriesColor(theme, index)
    variables[`cScale${index}`] = color
    variables[`cScaleInv${index}`] = theme.foreground
    variables[`cScaleLabel${index}`] = theme.foreground
  }
  for (let index = 0; index < 8; index++) {
    variables[`pie${index + 1}`] = seriesColor(theme, index)
    variables[`git${index}`] = seriesColor(theme, index)
  }

  return variables
}

function buildMermaidThemeCss(theme: DiagramThemeTokens): string {
  return `
.node text,
.edgeLabels text {
  font-weight: 600;
}

.node rect,
.node circle,
.node ellipse,
.node polygon,
.node path {
  stroke-width: 1px;
}

.node rect {
  rx: 12px;
  ry: 12px;
}

.edgeLabel .label rect {
  opacity: 1;
  rx: 8px;
  ry: 8px;
  fill: ${theme.background};
  stroke: ${theme.border};
  stroke-width: 1px;
}

.edgePaths .flowchart-link {
  stroke: ${theme.line};
  stroke-width: 1px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.marker {
  fill: ${theme.line};
  stroke: ${theme.line};
}
`.trim()
}

export function buildMermaidConfig(theme: DiagramThemeTokens, fontFamily: string): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrorRendering: true,
    theme: 'base',
    look: 'neo',
    layout: 'elk',
    darkMode: theme.mode === 'dark',
    fontFamily,
    htmlLabels: false,
    themeVariables: buildMermaidThemeVariables(theme, fontFamily),
    themeCSS: buildMermaidThemeCss(theme),
    flowchart: { useMaxWidth: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
    er: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    quadrantChart: { useMaxWidth: false },
    xyChart: { useMaxWidth: false },
    requirement: { useMaxWidth: false },
    mindmap: { useMaxWidth: false },
    kanban: { useMaxWidth: false },
    timeline: { useMaxWidth: false },
    gitGraph: { useMaxWidth: false },
    c4: { useMaxWidth: false },
    sankey: { useMaxWidth: false },
    block: { useMaxWidth: false },
    packet: { useMaxWidth: false },
    architecture: { useMaxWidth: false },
    radar: { useMaxWidth: false }
  }
}

export function buildPeleThemeVariables(
  theme: DiagramThemeTokens,
  fontFamily: string
): Record<string, string> {
  const variables: Record<string, string> = {
    '--pele-bg': theme.background,
    '--pele-fg': theme.foreground,
    '--pele-muted': theme.muted,
    '--pele-line': theme.line,
    '--pele-surface': theme.surface,
    '--pele-surface-alt': theme.surfaceAlt,
    '--pele-border': theme.border,
    '--pele-accent': theme.accent,
    '--pele-critical': theme.critical,
    '--pele-font': fontFamily,
    '--pele-font-mono': MONO_FONT,
    '--pele-radius': '10px',
    '--pele-title-weight': '600',
    '--pele-heading-weight': '600'
  }

  theme.series.forEach((color, index) => {
    variables[`--pele-series-${index + 1}`] = color
  })
  return variables
}
