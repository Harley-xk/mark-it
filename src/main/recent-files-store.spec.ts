import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_FILES,
  buildRecentFilesFile,
  parseRecentFilesFile,
  rememberRecentFile,
  seedRecentFiles,
  type RecentFileRecord
} from './recent-files-store'

describe('parseRecentFilesFile', () => {
  it('版本或结构不符时应回落空列表', () => {
    expect(parseRecentFilesFile(null)).toEqual([])
    expect(parseRecentFilesFile({ version: 2, files: [] })).toEqual([])
    expect(parseRecentFilesFile({ version: 1, files: 'oops' })).toEqual([])
  })

  it('应丢弃非文档扩展名、缺失路径与重复条目', () => {
    const records = parseRecentFilesFile(
      {
        version: 1,
        files: [
          { path: '/notes/a.md', name: 'a.md', openedAt: 10 },
          { path: '/notes/a.MD', name: 'a.md', openedAt: 20 },
          { path: '/notes/pic.png', name: 'pic.png', openedAt: 30 },
          { path: '', name: 'empty.md', openedAt: 40 },
          { path: '/notes/b.txt', openedAt: 5 }
        ]
      },
      'win32'
    )
    expect(records).toEqual([
      { path: '/notes/a.md', name: 'a.md', openedAt: 10 },
      { path: '/notes/b.txt', name: 'b.txt', openedAt: 5 }
    ])
  })

  it('应按打开时间倒序并截断到上限', () => {
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `/notes/${index}.md`,
      name: `${index}.md`,
      openedAt: index + 1
    }))
    const records = parseRecentFilesFile({ version: 1, files })
    expect(records).toHaveLength(MAX_RECENT_FILES)
    expect(records[0]).toEqual({ path: '/notes/24.md', name: '24.md', openedAt: 25 })
  })
})

describe('rememberRecentFile', () => {
  const base: RecentFileRecord[] = [
    { path: '/notes/a.md', name: 'a.md', openedAt: 2 },
    { path: '/notes/b.txt', name: 'b.txt', openedAt: 1 }
  ]

  it('应把重复路径移到最前并更新打开时间', () => {
    const next = rememberRecentFile(base, '/NOTES/A.MD', 9, 'win32')
    expect(next).toEqual([
      { path: '/NOTES/A.MD', name: 'A.MD', openedAt: 9 },
      { path: '/notes/b.txt', name: 'b.txt', openedAt: 1 }
    ])
    expect(base).toHaveLength(2)
  })

  it('非文档扩展名不应写入列表', () => {
    expect(rememberRecentFile(base, '/notes/pic.png', 9, 'win32')).toEqual(base)
  })

  it('超出上限时应丢弃最旧条目', () => {
    const files = Array.from({ length: MAX_RECENT_FILES }, (_, index) => ({
      path: `/notes/${index}.md`,
      name: `${index}.md`,
      openedAt: index
    }))
    const next = rememberRecentFile(files, '/notes/new.md', 100, 'win32')
    expect(next).toHaveLength(MAX_RECENT_FILES)
    expect(next[0].path).toBe('/notes/new.md')
    expect(next.some((record) => record.path === `/notes/${MAX_RECENT_FILES - 1}.md`)).toBe(false)
  })
})

describe('seedRecentFiles', () => {
  const base: RecentFileRecord[] = [{ path: '/notes/a.md', name: 'a.md', openedAt: 5 }]

  it('应把会话中缺失的路径追加到末尾且不改变已有顺序', () => {
    const next = seedRecentFiles(base, ['/notes/b.md', '/NOTES/A.MD', '/notes/c.md'], 'win32')
    expect(next.map((record) => record.path)).toEqual(['/notes/a.md', '/notes/b.md', '/notes/c.md'])
    expect(next[1].openedAt).toBe(0)
    expect(base).toHaveLength(1)
  })

  it('应忽略空路径、非文档扩展名与重复项', () => {
    const next = seedRecentFiles(base, [null, '', '/notes/pic.png', '/notes/a.md'], 'win32')
    expect(next).toEqual(base)
  })

  it('补齐时不应超过上限', () => {
    const records = Array.from({ length: MAX_RECENT_FILES }, (_, index) => ({
      path: `/notes/${index}.md`,
      name: `${index}.md`,
      openedAt: index + 1
    }))
    expect(seedRecentFiles(records, ['/notes/new.md'], 'win32')).toHaveLength(MAX_RECENT_FILES)
  })
})

describe('buildRecentFilesFile', () => {
  it('应写入版本号并限制条目数', () => {
    const records = Array.from({ length: MAX_RECENT_FILES + 5 }, (_, index) => ({
      path: `/notes/${index}.md`,
      name: `${index}.md`,
      openedAt: index
    }))
    const file = buildRecentFilesFile(records)
    expect(file.version).toBe(1)
    expect(file.files).toHaveLength(MAX_RECENT_FILES)
  })
})
