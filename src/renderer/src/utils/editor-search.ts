/*
 * 作者: Harley-xk
 * 创建: 2026-11-09
 *
 * 描述: CodeMirror 搜索匹配装饰的状态字段与派发辅助
 */

import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { TextMatch } from './search'

const matchDecoration = Decoration.mark({ class: 'markit-search-match' })
const activeMatchDecoration = Decoration.mark({ class: 'markit-search-match-active' })

const setSearchMatches = StateEffect.define<DecorationSet>()

const searchMatchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    // 文档编辑时先平移旧装饰，随后由组件重新计算并派发新的装饰集
    value = value.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setSearchMatches)) return effect.value
    }
    return value
  },
  provide: (field) => EditorView.decorations.from(field)
})

/** 编辑器扩展：提供搜索匹配高亮 */
export const searchMatchExtension = searchMatchField

export function buildSearchDecorations(matches: TextMatch[], activeIndex: number): DecorationSet {
  const ranges = matches.map((match, index) =>
    (index === activeIndex ? activeMatchDecoration : matchDecoration).range(match.from, match.to)
  )
  return Decoration.set(ranges, true)
}

/** 派发新的匹配装饰集；matches 必须按文档位置升序 */
export function applySearchDecorations(
  view: EditorView,
  matches: TextMatch[],
  activeIndex: number
): void {
  view.dispatch({ effects: setSearchMatches.of(buildSearchDecorations(matches, activeIndex)) })
}
