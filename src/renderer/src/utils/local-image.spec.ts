import { describe, expect, it } from 'vitest'
import { resolveImageSrc, resolveLocalPath, toLocalFileUrl } from './local-image'

describe('图片地址解析', () => {
  it('网络地址、data URL 与页内锚点应保持原样', () => {
    expect(resolveImageSrc('https://example.com/a.png', 'D:/docs/a.md')).toBeNull()
    expect(resolveImageSrc('//cdn.example.com/a.png', 'D:/docs/a.md')).toBeNull()
    expect(resolveImageSrc('data:image/png;base64,AAAA', 'D:/docs/a.md')).toBeNull()
    expect(resolveImageSrc('#anchor', 'D:/docs/a.md')).toBeNull()
  })

  it('相对路径应按文档所在目录解析', () => {
    expect(resolveImageSrc('./img/a.png', 'D:/docs/a.md')).toBe(toLocalFileUrl('D:/docs/img/a.png'))
    expect(resolveImageSrc('../assets/a.png', 'D:/docs/sub/a.md')).toBe(
      toLocalFileUrl('D:/docs/assets/a.png')
    )
  })

  it('没有文档路径时不应解析相对路径', () => {
    expect(resolveImageSrc('./img/a.png', null)).toBeNull()
  })

  it('Windows 绝对路径不应被当作协议', () => {
    expect(resolveImageSrc('C:\\img\\a.png', 'D:/docs/a.md')).toBe(toLocalFileUrl('C:/img/a.png'))
  })

  it('file:// 地址应转换为本地协议并解码', () => {
    expect(resolveImageSrc('file:///D:/img/%E5%9B%BE%201.png', null)).toBe(
      toLocalFileUrl('D:/img/图 1.png')
    )
  })
})

describe('本地链接解析', () => {
  it('页内锚点与外部地址应返回 null', () => {
    expect(resolveLocalPath('#anchor', 'D:/docs/a.md')).toBeNull()
    expect(resolveLocalPath('https://example.com/a', 'D:/docs/a.md')).toBeNull()
  })

  it('相对路径应去掉查询串与锚点后解析', () => {
    expect(resolveLocalPath('other.md?x=1#frag', 'D:/docs/a.md')).toBe('D:/docs/other.md')
  })

  it('file:// 地址应返回本地路径', () => {
    expect(resolveLocalPath('file:///D:/docs/other.md', null)).toBe('D:/docs/other.md')
  })
})
