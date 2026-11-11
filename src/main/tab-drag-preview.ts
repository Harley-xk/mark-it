/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 跨窗口标签拖拽悬浮提示的 HTML、尺寸与屏幕边缘定位
 */

export const TAB_DRAG_PREVIEW_WIDTH = 236
export const TAB_DRAG_PREVIEW_HEIGHT = 42
export const TAB_DRAG_PREVIEW_OFFSET = 14

interface Point {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

interface Rect extends Point, Size {}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** 标签名来自文件路径，进入 data URL 前必须转义，避免被解释为 HTML */
export function escapeTabDragPreviewText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

export function buildTabDragPreviewHtml(tabName: string, theme: 'light' | 'dark'): string {
  const displayName = escapeTabDragPreviewText(tabName.replace(/\s+/g, ' ').trim() || '未命名标签')
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'"
  />
  <title>tab-drag-preview</title>
  <style>
    :root {
      color-scheme: dark;
      --border: rgba(108, 155, 255, 0.4);
      --background: rgba(30, 38, 56, 0.96);
      --text: rgba(255, 255, 255, 0.94);
      --icon: #9bb8ff;
      --shadow: rgba(0, 0, 0, 0.34);
    }
    :root[data-theme='light'] {
      color-scheme: light;
      --border: rgba(59, 130, 246, 0.3);
      --background: rgba(255, 255, 255, 0.97);
      --text: #253047;
      --icon: #3b82f6;
      --shadow: rgba(48, 60, 86, 0.2);
    }
    * {
      box-sizing: border-box;
    }
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      user-select: none;
    }
    body {
      display: flex;
      align-items: center;
      padding: 4px;
      font: 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .drag-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: 34px;
      padding: 0 11px;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--background);
      color: var(--text);
      box-shadow: 0 8px 24px var(--shadow);
    }
    .drag-preview-icon {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      color: var(--icon);
    }
    .tab-drag-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="drag-preview">
    <svg
      class="drag-preview-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
    <span class="tab-drag-title">${displayName}</span>
  </div>
</body>
</html>`
}

/** 光标右下优先；靠近显示器边缘时翻到左上并夹取到工作区内 */
export function placeTabDragPreview(cursor: Point, size: Size, workArea: Rect): Point {
  let x = cursor.x + TAB_DRAG_PREVIEW_OFFSET
  let y = cursor.y + TAB_DRAG_PREVIEW_OFFSET

  if (x + size.width > workArea.x + workArea.width) {
    x = cursor.x - size.width - TAB_DRAG_PREVIEW_OFFSET
  }
  if (y + size.height > workArea.y + workArea.height) {
    y = cursor.y - size.height - TAB_DRAG_PREVIEW_OFFSET
  }

  const maxX = workArea.x + Math.max(0, workArea.width - size.width)
  const maxY = workArea.y + Math.max(0, workArea.height - size.height)
  return {
    x: Math.min(maxX, Math.max(workArea.x, x)),
    y: Math.min(maxY, Math.max(workArea.y, y))
  }
}
