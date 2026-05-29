import { EditorView } from '@codemirror/view'

export interface FormatAction {
  wrap?: [string, string]
  prefix?: string
  template?: string
  linePrefix?: string
}

export function applyFormatAction(view: EditorView | null, action: FormatAction): boolean {
  if (!view) return false

  const { state } = view

  if (action.wrap) {
    const [before, after] = action.wrap
    view.dispatch(
      state.changeByRange((range) => {
        return {
          changes: [
            { from: range.from, insert: before },
            { from: range.to, insert: after }
          ],
          range: range.extend(range.from + before.length, range.to + after.length)
        }
      })
    )
    return true
  }

  if (action.linePrefix) {
    view.dispatch(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from)
        const lineText = state.sliceDoc(line.from, line.to)
        const hasPrefix = lineText.startsWith(action.linePrefix!)
        const changes = hasPrefix
          ? { from: line.from, to: line.from + action.linePrefix!.length, insert: '' }
          : { from: line.from, insert: action.linePrefix! }
        return {
          changes,
          range: range
        }
      })
    )
    return true
  }

  if (action.template) {
    view.dispatch(
      state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: action.template! },
        range: range
      }))
    )
    return true
  }

  return false
}

export const formatActions: Record<string, FormatAction> = {
  bold: { wrap: ['**', '**'] },
  italic: { wrap: ['*', '*'] },
  strikethrough: { wrap: ['~~', '~~'] },
  h1: { linePrefix: '# ' },
  h2: { linePrefix: '## ' },
  h3: { linePrefix: '### ' },
  link: { wrap: ['[', '](url)'] },
  image: { template: '![alt](src)' },
  code: { wrap: ['`', '`'] },
  codeblock: { template: '```\n\n```' },
  quote: { linePrefix: '> ' },
  ul: { linePrefix: '- ' },
  ol: { linePrefix: '1. ' },
  task: { linePrefix: '- [ ] ' }
}
