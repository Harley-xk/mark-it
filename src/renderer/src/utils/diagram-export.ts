/** Mermaid 图表序列化与图片导出（预览内联缩放、弹窗预览共用） */

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export interface SerializedSvg {
  xml: string
  width: number
  height: number
}

/** 序列化 SVG 并补上独立查看所需的尺寸与命名空间 */
export function serializeSvg(svgEl: SVGSVGElement): SerializedSvg {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const viewBox = clone
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number)
  const width = viewBox?.[2] || clone.clientWidth || 800
  const height = viewBox?.[3] || clone.clientHeight || 600

  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', XLINK_NS)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  // mermaid 会给 svg 设置 max-width，单独查看/导出时不需要
  clone.style.maxWidth = ''

  return { xml: new XMLSerializer().serializeToString(clone), width, height }
}

/**
 * 把 SVG 文本绘制到 2x 画布并编码为 PNG。
 * htmlLabels 已关闭，画布不会被 foreignObject 污染
 */
export async function svgToPng(svgEl: SVGSVGElement, background: string): Promise<Uint8Array> {
  const { xml, width, height } = serializeSvg(svgEl)
  return svgXmlToPng(xml, width, height, background)
}

/** 把 SVG 文本渲染为 PNG（弹窗预览使用序列化后的字符串） */
export async function svgXmlToPng(
  xml: string,
  width: number,
  height: number,
  background: string
): Promise<Uint8Array> {
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG 图片加载失败'))
      image.src = url
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width * scale))
    canvas.height = Math.max(1, Math.ceil(height * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('PNG 编码失败')
    return new Uint8Array(await png.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 通过系统保存对话框下载图表；用户取消时静默返回 */
export async function saveDiagram(
  svgEl: SVGSVGElement,
  extension: 'svg' | 'png',
  background: string,
  fileName = `mermaid-${Date.now()}.${extension}`
): Promise<void> {
  if (extension === 'svg') {
    const { xml } = serializeSvg(svgEl)
    await window.api.saveImage(fileName, new TextEncoder().encode(xml), 'svg')
  } else {
    await window.api.saveImage(fileName, await svgToPng(svgEl, background), 'png')
  }
}
