/*
 * 作者: Harley-xk
 * 创建: 2026-11-16
 *
 * 描述: 对 Markdown 渲染结果做统一清洗，只保留安全的标签、属性与链接协议
 */
import DOMPurify from 'dompurify'
import type { Config } from 'dompurify'

/**
 * 允许的 URI：
 * - http / https / mailto / tel：外部链接交给系统浏览器
 * - file：预览点击后在资源管理器中定位
 * - markit-file：本地图片自定义协议
 * - data:image：内嵌图片
 * - 相对路径、页内锚点与 Windows 盘符路径
 *
 * 其余协议（javascript / vbscript / blob 等）一律移除。
 */
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|file|markit-file):|[a-z]:[\\/]|data:image\/|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

/**
 * Markdown 内容的安全子集。
 * - 任务列表由 markdown-it-task-lists 生成 input[type=checkbox]，必须保留 input；
 * - 标题锚点、本地图片与内嵌 SVG 依赖 id / class / data-* 与 svg 标签，保持默认放行；
 * - style 标签会全局影响应用界面，连同框架类标签一起禁止。
 */
const MARKDOWN_CONFIG: Config = {
  ALLOWED_URI_REGEXP,
  FORBID_TAGS: [
    'style',
    'iframe',
    'frame',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'textarea',
    'select'
  ],
  FORBID_ATTR: ['srcdoc']
}

/**
 * 清洗 Markdown 渲染结果。
 * 预览、PDF 导出与长图导出必须共用该函数，避免出现「预览安全、导出不安全」。
 */
export function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, MARKDOWN_CONFIG) as string
}

/**
 * 导出 HTML 的 CSP：导出页面不加载任何脚本，只保留内联样式与图片。
 * 主进程通过 executeJavaScript 等待图片与字体，不受页面 script-src 限制。
 */
export const EXPORT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src file: data: markit-file: https: http:',
  'font-src data:',
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')
