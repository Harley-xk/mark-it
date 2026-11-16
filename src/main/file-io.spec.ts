import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  FILE_SIZE_MAX_BYTES,
  FILE_SIZE_WARN_BYTES,
  mapFileError,
  readTextFile,
  writeTextFile,
  type FileIoPolicy
} from './file-io'
import { normalizeGuardPath } from './path-guard'

let workDir = ''

function policy(
  trusted: string[],
  options: Partial<Pick<FileIoPolicy, 'protectedRoots' | 'warnBytes' | 'maxBytes'>> = {}
): FileIoPolicy {
  return {
    platform: process.platform,
    trustedPaths: new Set(trusted.map((path) => normalizeGuardPath(path))),
    protectedRoots: (options.protectedRoots ?? []).map((path) => normalizeGuardPath(path)),
    warnBytes: options.warnBytes,
    maxBytes: options.maxBytes
  }
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'markit-file-io-'))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('文件读取', () => {
  it('信任集合外的路径应拒绝读取', async () => {
    const path = join(workDir, 'untrusted.md')
    writeFileSync(path, '# hi', 'utf-8')
    const result = await readTextFile(path, policy([]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-trusted')
  })

  it('可信 UTF-8 文件应返回内容、大小与可写状态', async () => {
    const path = join(workDir, 'normal.md')
    writeFileSync(path, '# 标题\n', 'utf-8')
    const result = await readTextFile(path, policy([path]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.content).toContain('# 标题')
    expect(result.file.encoding).toBe('utf-8')
    expect(result.file.readOnly).toBe(false)
    expect(result.file.excludedFromSession).toBe(false)
    expect(result.file.notices).toEqual([])
    expect(result.file.size).toBeGreaterThan(0)
  })

  it('非 UTF-8 文件应只读返回并给出提示', async () => {
    const path = join(workDir, 'gbk.md')
    writeFileSync(path, Buffer.from([0xd6, 0xd0, 0xce, 0xc4]))
    const result = await readTextFile(path, policy([path]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.readOnly).toBe(true)
    expect(result.file.encoding).toBe('unsupported')
    expect(result.file.notices).toContain('non-utf8')
  })

  it('超过警告阈值应只读并排除会话正文', async () => {
    const path = join(workDir, 'large.md')
    writeFileSync(path, '0123456789', 'utf-8')
    const result = await readTextFile(path, policy([path], { warnBytes: 4, maxBytes: 1024 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.readOnly).toBe(true)
    expect(result.file.excludedFromSession).toBe(true)
    expect(result.file.notices).toContain('large-file')
  })

  it('超过硬上限应拒绝打开', async () => {
    const path = join(workDir, 'too-large.md')
    writeFileSync(path, '0123456789', 'utf-8')
    const result = await readTextFile(path, policy([path], { warnBytes: 2, maxBytes: 4 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-large')
  })

  it('文件不存在与目录应映射为对应错误', async () => {
    const missing = await readTextFile(
      join(workDir, 'missing.md'),
      policy([join(workDir, 'missing.md')])
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('not-found')

    const directory = await readTextFile(workDir, policy([workDir]))
    expect(directory.ok).toBe(false)
    if (!directory.ok) expect(directory.error.code).toBe('is-directory')
  })
})

describe('文件写入', () => {
  it('可信路径应写入成功并返回大小', async () => {
    const path = join(workDir, 'write.md')
    const result = await writeTextFile(path, '# 内容', policy([path]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.size).toBeGreaterThan(0)
    const read = await readTextFile(path, policy([path]))
    expect(read.ok && read.file.content).toBe('# 内容')
  })

  it('不可信路径应拒绝写入', async () => {
    const path = join(workDir, 'write-untrusted.md')
    const result = await writeTextFile(path, 'x', policy([]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-trusted')
  })

  it('受保护目录应拒绝写入', async () => {
    const path = join(workDir, 'protected', 'a.md')
    const result = await writeTextFile(path, 'x', policy([path], { protectedRoots: [workDir] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('protected-path')
  })
})

describe('错误映射', () => {
  it('应覆盖常见 Node 错误码', () => {
    expect(mapFileError(Object.assign(new Error('x'), { code: 'ENOENT' })).code).toBe('not-found')
    expect(mapFileError(Object.assign(new Error('x'), { code: 'EACCES' })).code).toBe(
      'permission-denied'
    )
    expect(mapFileError(Object.assign(new Error('x'), { code: 'ENOSPC' })).code).toBe('disk-full')
    expect(mapFileError(new Error('unknown')).code).toBe('io-error')
  })

  it('默认阈值应为 5 MiB / 10 MiB', () => {
    expect(FILE_SIZE_WARN_BYTES).toBe(5 * 1024 * 1024)
    expect(FILE_SIZE_MAX_BYTES).toBe(10 * 1024 * 1024)
  })
})
