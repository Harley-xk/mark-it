import { describe, expect, it } from 'vitest'
import { parseSessionData } from './session-store'

function sessionWith(tab: Record<string, unknown>): unknown {
  return { tabs: [{ content: '# 文档', ...tab }], activeIndex: 0 }
}

describe('会话布局字段校验', () => {
  it('应保留合法的 layoutMode', () => {
    const data = parseSessionData(sessionWith({ layoutMode: 'preview-only' }))
    expect(data?.tabs[0].layoutMode).toBe('preview-only')
  })

  it('非法 layoutMode 应归一为 undefined', () => {
    const data = parseSessionData(sessionWith({ layoutMode: 'foo' }))
    expect(data?.tabs[0].layoutMode).toBeUndefined()
  })

  it('缺失 layoutMode 时应保持 undefined，交由渲染进程兜底', () => {
    const data = parseSessionData(sessionWith({}))
    expect(data?.tabs[0].layoutMode).toBeUndefined()
  })
})
