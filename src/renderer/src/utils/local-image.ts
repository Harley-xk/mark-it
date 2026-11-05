/**
 * 文档内相对路径图片的解析。
 *
 * 渲染进程拿不到文档所在目录，也没有 Node 的 path 模块，因此这里只实现
 * 图片引用所需的路径拼接与归一化；最终通过主进程注册的 markit-file
 * 协议读取本地文件，保证开发（http）与打包（file）两种运行方式都能显示。
 */

import type { MarkdownIt } from 'markdown-it'

const LOCAL_FILE_SCHEME = 'markit-file'
const WINDOWS_DRIVE = /^[a-zA-Z]:([\\/]|$)/
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isAbsolutePath(path: string): boolean {
  return WINDOWS_DRIVE.test(path) || path.startsWith('/') || path.startsWith('\\')
}

/** 网络地址、data/blob 等协议原样交给 Chromium；Windows 盘符不算协议 */
function isExternalSource(src: string): boolean {
  if (WINDOWS_DRIVE.test(src)) return false
  return SCHEME.test(src) || src.startsWith('//')
}

/** 统一分隔符并消除 `.` / `..`，保留盘符与 UNC 前缀 */
function normalizePath(input: string): string {
  const unified = input.replace(/\\/g, '/')
  const hasUncPrefix = unified.startsWith('//')
  const driveMatch = unified.match(/^([a-zA-Z]:)\//)
  const drive = driveMatch?.[1] ?? ''

  let rest = unified
  if (drive) rest = unified.slice(drive.length)
  else if (hasUncPrefix) rest = unified.replace(/^\/\//, '')

  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) segments.pop()
      continue
    }
    segments.push(segment)
  }

  const joined = segments.join('/')
  if (drive) return `${drive}/${joined}`
  if (hasUncPrefix) return `//${joined}`
  return `/${joined}`
}

/** file:// URL 转本地路径（兼容 Windows 盘符与 UNC） */
function fileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    let path = safeDecode(parsed.pathname)
    if (parsed.host && parsed.host !== 'localhost') {
      path = `//${parsed.host}${path}`
    }
    // Windows 下 file:///D:/x 的 pathname 为 /D:/x
    if (/^\/[a-zA-Z]:\//.test(path)) path = path.slice(1)
    return path || null
  } catch {
    return null
  }
}

/** 转为渲染进程可加载的本地文件 URL */
export function toLocalFileUrl(absolutePath: string): string {
  return `${LOCAL_FILE_SCHEME}://local/?p=${encodeURIComponent(absolutePath)}`
}

/**
 * 把 Markdown 图片地址解析为可加载的地址。
 * 返回 null 表示保持原样（网络图片、data URL、没有文档路径等）。
 */
export function resolveImageSrc(src: string, documentPath?: string | null): string | null {
  const decoded = safeDecode(src.trim())
  if (!decoded || decoded.startsWith('#') || decoded.startsWith('data:')) return null

  if (/^file:\/\//i.test(decoded)) {
    const path = fileUrlToPath(decoded)
    return path ? toLocalFileUrl(path) : null
  }

  if (isExternalSource(decoded)) return null

  let absolutePath: string
  if (isAbsolutePath(decoded)) {
    absolutePath = normalizePath(decoded)
  } else {
    if (!documentPath) return null
    const docDir = normalizePath(documentPath).replace(/\/[^/]*$/, '')
    absolutePath = normalizePath(`${docDir}/${decoded}`)
  }

  return toLocalFileUrl(absolutePath)
}

/**
 * 把文档内的链接解析为绝对本地路径（供“在文件夹中显示”使用）。
 * 返回 null 表示页内锚点、网络地址或无法解析，调用方不应执行任何操作。
 */
export function resolveLocalPath(href: string, documentPath?: string | null): string | null {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  if (/^file:\/\//i.test(trimmed)) {
    return fileUrlToPath(trimmed)
  }

  // 查询串与锚点不属于文件路径
  const decoded = safeDecode(trimmed.split(/[?#]/, 1)[0])
  if (!decoded) return null
  if (isExternalSource(decoded)) return null

  if (isAbsolutePath(decoded)) return normalizePath(decoded)
  if (!documentPath) return null

  const docDir = normalizePath(documentPath).replace(/\/[^/]*$/, '')
  return normalizePath(`${docDir}/${decoded}`)
}

/**
 * 给 MarkdownIt 实例安装图片地址解析：预览与 PDF 导出共用。
 * getDocumentPath 在渲染时调用，保证 Vue 能收集到当前文档的依赖。
 */
export function installLocalImageRule(
  md: MarkdownIt,
  getDocumentPath: () => string | null | undefined
): void {
  const defaultImageRule = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const src = token.attrGet('src')
    // markdown-it 15 的 attrGet 返回 string | number | null，图片地址只接受字符串
    if (typeof src === 'string' && src) {
      const resolved = resolveImageSrc(src, getDocumentPath())
      if (resolved) token.attrSet('src', resolved)
    }
    return defaultImageRule
      ? defaultImageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}
