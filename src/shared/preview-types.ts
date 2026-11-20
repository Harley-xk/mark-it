/*
 * 作者: Harley-xk
 * 创建: 2026-11-20
 *
 * 描述: 跨进程共享的独立预览窗口载荷类型
 */

export type PreviewTheme = 'light' | 'dark'

export interface DiagramPreviewMedia {
  kind: 'diagram'
  /** 已序列化的 SVG 文本（带 xmlns 与固定尺寸） */
  svgXml: string
  width: number
  height: number
  background: string
}

export interface ImagePreviewMedia {
  kind: 'image'
  /** 预览窗口中可加载的图片地址 */
  src: string
  width: number
  height: number
  background: string
  fileName: string
  /** 本地图片的绝对路径；远程与 data 图片为 null */
  localPath: string | null
  remote: boolean
}

export type PreviewMedia = DiagramPreviewMedia | ImagePreviewMedia

export interface PreviewWindowPayload {
  theme: PreviewTheme
  media: PreviewMedia
}
