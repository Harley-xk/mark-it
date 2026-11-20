import { describe, expect, it } from 'vitest'
import { parsePreviewPayload, PREVIEW_SVG_MAX_LENGTH } from './preview-payload'

describe('预览窗口载荷校验', () => {
  it('应接受完整的图表载荷', () => {
    const payload = parsePreviewPayload({
      theme: 'dark',
      media: {
        kind: 'diagram',
        svgXml: '<svg xmlns="http://www.w3.org/2000/svg" />',
        width: 1200,
        height: 800,
        background: '#0d1117'
      }
    })
    expect(payload).toEqual({
      theme: 'dark',
      media: {
        kind: 'diagram',
        svgXml: '<svg xmlns="http://www.w3.org/2000/svg" />',
        width: 1200,
        height: 800,
        background: '#0d1117'
      }
    })
  })

  it('应接受图片载荷并补齐缺失字段', () => {
    const payload = parsePreviewPayload({
      theme: 'light',
      media: {
        kind: 'image',
        src: 'markit-file://local/?p=D%3A%2Fa.png',
        width: 400,
        height: 300
      }
    })
    expect(payload?.media).toMatchObject({
      kind: 'image',
      width: 400,
      height: 300,
      background: '#ffffff',
      fileName: 'image.png',
      localPath: null,
      remote: false
    })
  })

  it('尺寸非法时应回退到默认值', () => {
    const payload = parsePreviewPayload({
      theme: 'dark',
      media: { kind: 'image', src: 'https://example.com/a.png', width: 0, height: -1 }
    })
    expect(payload?.media).toMatchObject({ width: 800, height: 600 })
  })

  it('应拒绝缺失主题、缺失媒体或未知类型', () => {
    expect(parsePreviewPayload(null)).toBeNull()
    expect(parsePreviewPayload({ media: { kind: 'image', src: 'a.png' } })).toBeNull()
    expect(parsePreviewPayload({ theme: 'dark' })).toBeNull()
    expect(
      parsePreviewPayload({ theme: 'dark', media: { kind: 'video', src: 'a.mp4' } })
    ).toBeNull()
  })

  it('应拒绝空内容与超过长度上限的 SVG', () => {
    expect(
      parsePreviewPayload({ theme: 'dark', media: { kind: 'diagram', svgXml: '   ' } })
    ).toBeNull()
    expect(
      parsePreviewPayload({
        theme: 'dark',
        media: {
          kind: 'diagram',
          svgXml: 'x'.repeat(PREVIEW_SVG_MAX_LENGTH + 1),
          width: 10,
          height: 10
        }
      })
    ).toBeNull()
  })
})
