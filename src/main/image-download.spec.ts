import { describe, expect, it } from 'vitest'
import {
  imageExtensionFromContentType,
  imageExtensionOf,
  parseRemoteImageUrl,
  resolveImageDownloadExtension
} from './image-download'

describe('远程图片地址校验', () => {
  it('只接受 http 与 https', () => {
    expect(parseRemoteImageUrl('https://example.com/a.png')?.host).toBe('example.com')
    expect(parseRemoteImageUrl('http://example.com/a.png')?.protocol).toBe('http:')
  })

  it('应拒绝其他协议与非法地址', () => {
    expect(parseRemoteImageUrl('file:///D:/a.png')).toBeNull()
    expect(parseRemoteImageUrl('ftp://example.com/a.png')).toBeNull()
    expect(parseRemoteImageUrl('javascript:alert(1)')).toBeNull()
    expect(parseRemoteImageUrl('not a url')).toBeNull()
    expect(parseRemoteImageUrl('')).toBeNull()
    expect(parseRemoteImageUrl(null)).toBeNull()
  })
})

describe('图片扩展名推断', () => {
  it('应从文件名或路径中提取白名单内的扩展名', () => {
    expect(imageExtensionOf('photo.PNG')).toBe('png')
    expect(imageExtensionOf('/a/b.jpeg?x=1#y')).toBe('jpeg')
    expect(imageExtensionOf('C:\\img\\a.webp')).toBe('webp')
  })

  it('非图片扩展名应返回 null', () => {
    expect(imageExtensionOf('archive.zip')).toBeNull()
    expect(imageExtensionOf('https://example.com/download')).toBeNull()
  })

  it('应按响应类型映射扩展名', () => {
    expect(imageExtensionFromContentType('image/png')).toBe('png')
    expect(imageExtensionFromContentType('image/jpeg; charset=binary')).toBe('jpg')
    expect(imageExtensionFromContentType('image/svg+xml')).toBe('svg')
    expect(imageExtensionFromContentType('application/octet-stream')).toBeNull()
    expect(imageExtensionFromContentType(null)).toBeNull()
  })

  it('扩展名优先级为文件名、响应类型、地址、png', () => {
    const url = new URL('https://example.com/a.gif')
    expect(resolveImageDownloadExtension('photo.jpg', url, 'image/png')).toBe('jpg')
    expect(resolveImageDownloadExtension('image.php', url, 'image/webp')).toBe('webp')
    expect(resolveImageDownloadExtension('', url, null)).toBe('gif')
    expect(resolveImageDownloadExtension('', new URL('https://example.com/download'), null)).toBe(
      'png'
    )
  })
})
