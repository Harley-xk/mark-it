/*
 * 作者: Harley-xk
 * 创建: 2026-11-17
 *
 * 描述: 监听窗口级文件拖拽，显示落点覆盖层并把文件交给打开流程
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useFile } from './useFile'

/** 只响应系统文件拖拽；内部标签拖拽使用 Pointer Events，不会进入这里 */
function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

export function useFileDrop(): { dragActive: Ref<boolean> } {
  const file = useFile()
  const dragActive = ref(false)
  // dragenter / dragleave 会在子元素之间反复触发，用计数避免闪烁
  let depth = 0

  function reset(): void {
    depth = 0
    dragActive.value = false
  }

  function onDragEnter(event: DragEvent): void {
    if (!isFileDrag(event)) return
    event.preventDefault()
    depth += 1
    dragActive.value = true
  }

  function onDragOver(event: DragEvent): void {
    if (!isFileDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event: DragEvent): void {
    if (!isFileDrag(event)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) dragActive.value = false
  }

  function onDrop(event: DragEvent): void {
    if (!isFileDrag(event)) return
    event.preventDefault()
    reset()
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) void file.openDroppedFiles(files)
  }

  function onWindowBlur(): void {
    reset()
  }

  // 使用捕获阶段：编辑器等内部容器可能吞掉文件 drop，窗口级兜底必须先拿到事件
  const capture = true
  onMounted(() => {
    window.addEventListener('dragenter', onDragEnter, capture)
    window.addEventListener('dragover', onDragOver, capture)
    window.addEventListener('dragleave', onDragLeave, capture)
    window.addEventListener('drop', onDrop, capture)
    window.addEventListener('blur', onWindowBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('dragenter', onDragEnter, capture)
    window.removeEventListener('dragover', onDragOver, capture)
    window.removeEventListener('dragleave', onDragLeave, capture)
    window.removeEventListener('drop', onDrop, capture)
    window.removeEventListener('blur', onWindowBlur)
  })

  return { dragActive }
}
