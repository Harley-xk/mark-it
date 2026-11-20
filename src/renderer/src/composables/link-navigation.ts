/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 记录链接打开后待定位的目标，在目标标签首次激活时由编辑区与预览区各自消费
 */
import type { LinkTargetKind, ResolvedLinkTarget } from '../utils/link-target'

/** 编辑区跳转：滚动到指定行并放置光标 */
export interface PendingEditorJump {
  kind: LinkTargetKind
  line: number
  column: number
}

/** 预览区跳转：优先匹配显式 id，其次匹配标题锚点；都为 null 时回到顶部 */
export interface PendingPreviewJump {
  kind: LinkTargetKind
  anchorId: string | null
  headingId: string | null
}

// 后台标签没有编辑区 / 预览层的实例可供立即定位，先把目标存在这里，
// 等标签首次激活、两侧恢复滚动完成后再应用，避免被滚动恢复覆盖。
const editorJumps = new Map<string, PendingEditorJump>()
const previewJumps = new Map<string, PendingPreviewJump>()

export function setPendingLinkTarget(docId: string, target: ResolvedLinkTarget): void {
  editorJumps.set(docId, { kind: target.kind, line: target.line, column: target.column })
  previewJumps.set(docId, {
    kind: target.kind,
    anchorId: target.anchorId,
    headingId: target.headingId
  })
}

/** 编辑区消费一次跳转目标；没有目标时不产生任何动作 */
export function takeEditorJump(docId: string): PendingEditorJump | null {
  const jump = editorJumps.get(docId) ?? null
  editorJumps.delete(docId)
  return jump
}

/** 预览区消费一次跳转目标；没有目标时不产生任何动作 */
export function takePreviewJump(docId: string): PendingPreviewJump | null {
  const jump = previewJumps.get(docId) ?? null
  previewJumps.delete(docId)
  return jump
}

/** 标签关闭时清理残留目标，避免从未激活过的后台标签留下无效记录 */
export function clearPendingLinkTarget(docId: string): void {
  editorJumps.delete(docId)
  previewJumps.delete(docId)
}
