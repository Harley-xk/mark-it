import { describe, expect, it } from 'vitest'
import { isUntitledName, stripExtension, tabIconLetter } from './tab-icon'

describe('tabIconLetter', () => {
  it('中文文件名取第一个汉字', () => {
    expect(tabIconLetter('设计文档.md')).toBe('设')
  })

  it('拉丁字母转大写', () => {
    expect(tabIconLetter('readme.md')).toBe('R')
  })

  it('组合 emoji 作为一个字素返回', () => {
    expect(tabIconLetter('👨‍👩‍👧‍👦笔记.md')).toBe('👨‍👩‍👧‍👦')
  })

  it('跳过前导标点与空白', () => {
    expect(tabIconLetter(' - 01 计划.md')).toBe('0')
    expect(tabIconLetter('_draft.md')).toBe('D')
  })

  it('隐藏文件跳过开头的点', () => {
    expect(tabIconLetter('.gitignore')).toBe('G')
  })

  it('多点文件名只去掉最后一个扩展名', () => {
    expect(tabIconLetter('v1.2.笔记.md')).toBe('V')
  })

  it('无扩展名文件原样取首字符', () => {
    expect(tabIconLetter('使用手册')).toBe('使')
  })

  it('没有可用字符时回退为问号', () => {
    expect(tabIconLetter('')).toBe('?')
    expect(tabIconLetter('   ')).toBe('?')
    expect(tabIconLetter('---.md')).toBe('?')
  })
})

describe('stripExtension', () => {
  it('去掉最后一个扩展名', () => {
    expect(stripExtension('a.b.md')).toBe('a.b')
  })

  it('点开头的隐藏文件保留原名', () => {
    expect(stripExtension('.gitignore')).toBe('.gitignore')
  })

  it('末尾是点时不当作扩展名', () => {
    expect(stripExtension('note.')).toBe('note.')
  })
})

describe('isUntitledName', () => {
  it('识别自动命名的空白文档', () => {
    expect(isUntitledName('untitled.md')).toBe(true)
    expect(isUntitledName('Untitled-2.md')).toBe(true)
    expect(isUntitledName('untitled.markdown')).toBe(true)
  })

  it('普通文件与手册名不当作空白文档', () => {
    expect(isUntitledName('notes.md')).toBe(false)
    expect(isUntitledName('使用手册')).toBe(false)
    expect(isUntitledName('untitled-notes.md')).toBe(false)
  })
})
