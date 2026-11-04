import { describe, expect, it } from 'vitest'
import { formatMermaidError, getMermaidLanguage } from './mermaid'

function fakeCodeElement(classes: string[]): Element {
  return { classList: classes } as unknown as Element
}

describe('Mermaid 语言标记识别', () => {
  it('应忽略大小写并兼容版本后缀', () => {
    expect(getMermaidLanguage(fakeCodeElement(['language-flowchart']))).toBe('flowchart')
    expect(getMermaidLanguage(fakeCodeElement(['language-FLOWCHART']))).toBe('FLOWCHART')
    expect(getMermaidLanguage(fakeCodeElement(['language-xychart-beta']))).toBe('xychart-beta')
    expect(getMermaidLanguage(fakeCodeElement(['language-stateDiagram-v2']))).toBe(
      'stateDiagram-v2'
    )
  })

  it('应支持 C4 系列图表', () => {
    expect(getMermaidLanguage(fakeCodeElement(['language-C4Context']))).toBe('C4Context')
    expect(getMermaidLanguage(fakeCodeElement(['language-c4Deployment']))).toBe('c4Deployment')
  })

  it('普通代码语言不应被误判为 Mermaid', () => {
    expect(getMermaidLanguage(fakeCodeElement(['language-javascript']))).toBeNull()
    expect(getMermaidLanguage(fakeCodeElement(['language-mermaid-extra']))).toBeNull()
    expect(getMermaidLanguage(fakeCodeElement(['hljs', 'language-ts']))).toBeNull()
  })
})

describe('Mermaid 错误提示', () => {
  it('应只保留首行并附带 got token', () => {
    expect(formatMermaidError(new Error("Parse error on line 2:\ngot 'X'\nExpecting 'Y'"))).toBe(
      "Parse error on line 2（got 'X'）"
    )
  })

  it('应处理空错误信息', () => {
    expect(formatMermaidError(new Error(''))).toBe('未知错误')
    expect(formatMermaidError('')).toBe('未知错误')
  })
})
