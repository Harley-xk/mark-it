import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_EXPORT_SETTINGS,
  normalizeImageExportSettings
} from './image-export-settings'

describe('图片导出设置归一化', () => {
  it('合法设置应完整保留', () => {
    const settings = {
      format: 'jpeg' as const,
      contentWidth: 1000 as const,
      scale: 1 as const,
      theme: 'dark' as const,
      includeFrontmatter: false
    }

    expect(normalizeImageExportSettings(settings)).toEqual(settings)
  })

  it('损坏或非对象设置应整体回退默认值', () => {
    expect(normalizeImageExportSettings(null)).toEqual(DEFAULT_IMAGE_EXPORT_SETTINGS)
    expect(normalizeImageExportSettings('invalid')).toEqual(DEFAULT_IMAGE_EXPORT_SETTINGS)
    expect(normalizeImageExportSettings([])).toEqual(DEFAULT_IMAGE_EXPORT_SETTINGS)
  })

  it('非法字段应逐项回退并保留其余合法字段', () => {
    expect(
      normalizeImageExportSettings({
        format: 'webp',
        contentWidth: 900,
        scale: 3,
        theme: 'sepia',
        includeFrontmatter: 'yes'
      })
    ).toEqual(DEFAULT_IMAGE_EXPORT_SETTINGS)
  })

  it('缺省字段应分别回退，不应丢弃合法的布尔值与枚举值', () => {
    expect(
      normalizeImageExportSettings({
        format: 'jpeg',
        contentWidth: 640,
        scale: 1,
        theme: 'light',
        includeFrontmatter: false
      })
    ).toEqual({
      format: 'jpeg',
      contentWidth: 640,
      scale: 1,
      theme: 'light',
      includeFrontmatter: false
    })
  })
})
