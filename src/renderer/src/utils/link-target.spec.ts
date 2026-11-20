import { describe, expect, it } from 'vitest'
import { githubHeadingSlug, resolveLinkTarget, splitLinkLocation } from './link-target'

const CONTENT = [
  '---',
  'title: demo',
  '---',
  '# 第一章',
  '',
  '## Second Part',
  '正文',
  '## 重复标题',
  'a',
  '## 重复标题'
].join('\n')

describe('链接地址拆分', () => {
  it('应拆出片段并去掉查询串', () => {
    expect(splitLinkLocation('./other.md?x=1#frag')).toEqual({
      href: './other.md',
      fragment: 'frag',
      line: null,
      column: null
    })
  })

  it('应识别 Markdown 目标的行号与列号后缀', () => {
    expect(splitLinkLocation('./other.md:12')).toEqual({
      href: './other.md',
      fragment: null,
      line: 12,
      column: null
    })
    expect(splitLinkLocation('./other.md:12:5')).toEqual({
      href: './other.md',
      fragment: null,
      line: 12,
      column: 5
    })
  })

  it('不应拆除非 Markdown 文件与 Windows 盘符路径', () => {
    expect(splitLinkLocation('./pic.png:12').href).toBe('./pic.png:12')
    expect(splitLinkLocation('D:\\docs\\a.md')).toEqual({
      href: 'D:\\docs\\a.md',
      fragment: null,
      line: null,
      column: null
    })
  })

  it('片段中的行号保留在片段里，由目标解析处理', () => {
    expect(splitLinkLocation('./other.md#L20')).toEqual({
      href: './other.md',
      fragment: 'L20',
      line: null,
      column: null
    })
  })
})

describe('GitHub 风格标题 slug', () => {
  it('应小写、去标点并把空格转为连字符', () => {
    expect(githubHeadingSlug('Hello, World!')).toBe('hello-world')
    expect(githubHeadingSlug('API v2.0')).toBe('api-v20')
  })

  it('中文与空格应保留并按规则转写', () => {
    expect(githubHeadingSlug('安装 与 使用')).toBe('安装-与-使用')
    expect(githubHeadingSlug('第二章')).toBe('第二章')
  })
})

describe('链接定位目标解析', () => {
  it('应按 GitHub slug 与标题原文匹配标题', () => {
    const base = { href: './target.md', line: null, column: null }
    expect(resolveLinkTarget(CONTENT, { ...base, fragment: '第一章' })).toEqual({
      kind: 'heading',
      anchorId: '第一章',
      headingId: 'heading-0',
      line: 4,
      column: 1
    })
    expect(resolveLinkTarget(CONTENT, { ...base, fragment: 'second-part' })?.headingId).toBe(
      'heading-1'
    )
  })

  it('重复标题应按 GitHub 规则追加 -1 后缀', () => {
    const base = { href: './target.md', line: null, column: null }
    expect(resolveLinkTarget(CONTENT, { ...base, fragment: '重复标题' })?.headingId).toBe(
      'heading-2'
    )
    expect(resolveLinkTarget(CONTENT, { ...base, fragment: '重复标题-1' })?.headingId).toBe(
      'heading-3'
    )
  })

  it('应支持预览内部的 heading-N 锚点', () => {
    const target = resolveLinkTarget(CONTENT, {
      href: './target.md',
      fragment: 'heading-2',
      line: null,
      column: null
    })
    expect(target?.headingId).toBe('heading-2')
    expect(target?.line).toBe(8)
  })

  it('行号应定位到该行之前最近的标题', () => {
    const target = resolveLinkTarget(CONTENT, {
      href: './target.md',
      fragment: null,
      line: 7,
      column: null
    })
    expect(target).toEqual({
      kind: 'line',
      anchorId: null,
      headingId: 'heading-1',
      line: 7,
      column: 1
    })
  })

  it('应支持 #L12 与 #L12-L20 行号片段', () => {
    const line = resolveLinkTarget(CONTENT, {
      href: './target.md',
      fragment: 'L9',
      line: null,
      column: null
    })
    expect(line?.line).toBe(9)
    expect(line?.headingId).toBe('heading-2')
    expect(
      resolveLinkTarget(CONTENT, {
        href: './target.md',
        fragment: 'L9-L12',
        line: null,
        column: null
      })?.line
    ).toBe(9)
  })

  it('显式路径行号优先于片段行号，并保留列号', () => {
    const target = resolveLinkTarget(CONTENT, {
      href: './target.md',
      fragment: 'L20',
      line: 6,
      column: 4
    })
    expect(target?.line).toBe(6)
    expect(target?.column).toBe(4)
    expect(target?.headingId).toBe('heading-1')
  })

  it('文档内找不到的片段保留为显式 id，供自定义锚点命中', () => {
    const target = resolveLinkTarget(CONTENT, {
      href: './target.md',
      fragment: 'custom-anchor',
      line: null,
      column: null
    })
    expect(target).toEqual({
      kind: 'heading',
      anchorId: 'custom-anchor',
      headingId: null,
      line: 1,
      column: 1
    })
  })

  it('没有片段与行号时不产生定位目标', () => {
    expect(
      resolveLinkTarget(CONTENT, { href: './target.md', fragment: null, line: null, column: null })
    ).toBeNull()
  })
})
