/*
 * 作者: Harley-xk
 * 创建: 2026-11-04
 *
 * 描述: 退出 / 重启前的未保存内容确认流程，关闭窗口与安装更新共用
 */
import { useDocumentsStore } from '../stores/documents'
import { useFile } from './useFile'
import { confirmUnsaved } from './useConfirmUnsaved'
import { flushSession } from './useSession'

/**
 * 逐个确认所有标签页的未保存修改，并保存会话。
 * @param actionLabel 确认框标题，说明本次操作（关闭窗口 / 安装更新）
 * @returns false 表示用户取消或保存失败，应中止后续操作
 */
export async function saveAllBeforeExit(actionLabel: string): Promise<boolean> {
  const docs = useDocumentsStore()
  const file = useFile()

  for (const doc of docs.docs.filter((doc) => doc.isModified)) {
    const action = await confirmUnsaved(
      actionLabel,
      `「${doc.name}」有未保存的修改，是否保存？`,
      undefined,
      true
    )
    if (action === 'cancel') return false
    if (action === 'save' && !(await file.saveDocument(doc))) return false
  }

  // 记录当前标签页，下次启动恢复
  await flushSession()
  return true
}
