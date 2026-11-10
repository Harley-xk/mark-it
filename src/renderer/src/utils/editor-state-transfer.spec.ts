import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { describe, expect, it } from 'vitest'
import { restoreEditorState, serializeEditorState } from './editor-state-transfer'

describe('编辑器状态迁移', () => {
  it('应在大小时内保留文档、选区和历史状态', () => {
    const initial = EditorState.create({ doc: 'alpha', extensions: [history()] })
    const edited = initial.update({
      changes: { from: 5, insert: '-beta' },
      selection: { anchor: 10 }
    }).state
    const serialized = serializeEditorState(edited)

    expect(serialized).toBeDefined()
    const restored = restoreEditorState(serialized, [history()])
    expect(restored?.doc.toString()).toBe('alpha-beta')
    expect(restored?.selection.main.head).toBe(10)
  })

  it('超过大小上限时应放弃历史载荷而不是抛错', () => {
    const state = EditorState.create({ doc: 'content', extensions: [history()] })
    expect(serializeEditorState(state, 10)).toBeUndefined()
  })

  it('损坏的历史 JSON 应安全回退到 null', () => {
    expect(restoreEditorState({ doc: 'missing fields' }, [history()])).toBeNull()
    expect(restoreEditorState('not-an-object', [history()])).toBeNull()
  })
})
