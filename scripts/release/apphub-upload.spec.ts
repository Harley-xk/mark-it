import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { formatUploadError, runUpload } from './apphub-upload.mjs'
import { CliError } from './apphub.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function createFixture({ size = 32, blockmap = false } = {}): Promise<{
  dir: string
  file: string
  blockmap: string | undefined
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mark-it-apphub-upload-'))
  tempDirs.push(dir)
  const file = path.join(dir, 'mark-it-1.6.0-universal.zip')
  await fs.writeFile(file, Buffer.alloc(size, 1))

  let blockmapPath: string | undefined
  if (blockmap) {
    blockmapPath = `${file}.blockmap`
    await fs.writeFile(blockmapPath, Buffer.alloc(Math.max(1, Math.floor(size / 4)), 2))
  }
  return { dir, file, blockmap: blockmapPath }
}

function createLogger(): { log: Mock; warn: Mock; error: Mock } {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}

function createClient(
  credential: Record<string, unknown>,
  { uploadTokenError }: { uploadTokenError?: Error } = {}
): {
  client: { appKey: string; login: Mock; get: Mock; request: Mock }
  registerRequests: Record<string, unknown>[]
  tokenRequests: Record<string, unknown>[]
} {
  const registerRequests: Record<string, unknown>[] = []
  const tokenRequests: Record<string, unknown>[] = []
  const client = {
    appKey: 'app-key',
    login: vi.fn(async () => 'jwt-token'),
    get: vi.fn(async (apiPath: string) => {
      if (apiPath === '/appcenter/app') {
        return { list: [{ id: 'app-id', appKey: 'app-key' }], total: 1 }
      }
      if (apiPath === '/appcenter/app/app-id/channel') {
        return [{ id: 'channel-id', code: 'stable' }]
      }
      if (apiPath === '/appcenter/app/app-id/version') {
        return { list: [{ id: 'version-id', version: '1.6.0', status: 'draft' }], total: 1 }
      }
      throw new Error(`unexpected GET ${apiPath}`)
    }),
    request: vi.fn(async (method: string, apiPath: string, options?: { body?: unknown }) => {
      if (method === 'POST' && apiPath === '/appcenter/version/version-id/package/upload-token') {
        tokenRequests.push(options?.body as Record<string, unknown>)
        if (uploadTokenError && tokenRequests.length === 1) throw uploadTokenError
        return credential
      }
      if (method === 'POST' && apiPath === '/appcenter/version/version-id/package') {
        registerRequests.push(options?.body as Record<string, unknown>)
        return 'package-id'
      }
      throw new Error(`unexpected ${method} ${apiPath}`)
    })
  }
  return { client, registerRequests, tokenRequests }
}

function createUploadHarness({
  credential,
  uploadMultipart = vi.fn(async () => undefined),
  uploadTokenError
}: {
  credential: Record<string, unknown>
  uploadMultipart?: ReturnType<typeof vi.fn>
  uploadTokenError?: Error
}): {
  client: ReturnType<typeof createClient>['client']
  registerRequests: Record<string, unknown>[]
  tokenRequests: Record<string, unknown>[]
  transport: { assertObjectSize: Mock }
  dependencies: {
    loadConfig: Mock
    createClient: Mock
    hashFile: Mock
    putObject: Mock
    createMultipartTransport: Mock
    uploadMultipart: Mock
  }
} {
  const { client, registerRequests, tokenRequests } = createClient(credential, {
    uploadTokenError
  })
  const transport = { assertObjectSize: vi.fn(async () => undefined) }
  return {
    client,
    registerRequests,
    tokenRequests,
    transport,
    dependencies: {
      loadConfig: vi.fn(async () => ({
        baseUrl: 'https://appcenter.example.test',
        appKey: 'app-key',
        channel: 'stable',
        credentials: { username: 'test-user', password: 'test-password' }
      })),
      createClient: vi.fn(() => client),
      hashFile: vi.fn(async () => ({
        sha256: 'sha256-value',
        sha512: 'sha512-value'
      })),
      putObject: vi.fn(async () => undefined),
      createMultipartTransport: vi.fn(() => transport),
      uploadMultipart
    }
  }
}

describe('AppHub 上传适配入口', () => {
  it.each([
    { label: '小文件', threshold: '1024', extraArgs: [] as string[] },
    { label: 'multipart=off', threshold: '0', extraArgs: ['--multipart', 'off'] }
  ])('$label 时委托原 CLI，且不加载大文件流程', async ({ threshold, extraArgs }) => {
    const fixture = await createFixture()
    const spawnSync = vi.fn(() => ({ status: 0 }))
    const loadConfig = vi.fn()
    const createClient = vi.fn()

    const status = await runUpload({
      argv: [
        'upload',
        '--config',
        '.apphub-release.ci.json',
        '--version',
        '1.6.0',
        '--platform',
        'macos',
        '--arch',
        'universal',
        '--file',
        fixture.file,
        ...extraArgs
      ],
      env: {
        APPHUB_MULTIPART_THRESHOLD_BYTES: threshold
      },
      dependencies: { spawnSync, loadConfig, createClient },
      logger: createLogger()
    })

    expect(status).toBe(0)
    expect(spawnSync).toHaveBeenCalledOnce()
    expect(spawnSync.mock.calls[0][1]).toContain(fixture.file)
    expect(spawnSync.mock.calls[0][1]).not.toContain('--multipart')
    expect(loadConfig).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('安装包和 blockmap 都成功后登记一次包记录', async () => {
    const fixture = await createFixture({ blockmap: true })
    const credential = {
      region: 'oss-cn-hangzhou',
      bucket: 'release-bucket',
      objectKey: 'packages/mark-it.zip',
      blockmapObjectKey: 'packages/mark-it.zip.blockmap',
      expiration: '2026-11-11T12:00:00.000Z'
    }
    const harness = createUploadHarness({ credential })

    const status = await runUpload({
      argv: [
        'upload',
        '--version',
        '1.6.0',
        '--platform',
        'macos',
        '--arch',
        'universal',
        '--file',
        fixture.file,
        '--blockmap',
        fixture.blockmap as string,
        '--multipart',
        'auto'
      ],
      env: { APPHUB_MULTIPART_THRESHOLD_BYTES: '0' },
      dependencies: harness.dependencies,
      logger: createLogger()
    })

    expect(status).toBe(0)
    expect(harness.client.login).toHaveBeenCalledOnce()
    expect(harness.dependencies.uploadMultipart).toHaveBeenCalledTimes(2)
    expect(harness.transport.assertObjectSize).toHaveBeenCalledTimes(2)
    expect(harness.dependencies.putObject).not.toHaveBeenCalled()
    expect(harness.registerRequests).toHaveLength(1)
    expect(harness.registerRequests[0]).toMatchObject({
      platform: 'macos',
      arch: 'universal',
      fileName: 'mark-it-1.6.0-universal.zip',
      objectKey: 'packages/mark-it.zip',
      blockmapSha512: 'sha512-value',
      blockmapFileSize: 8
    })
  })

  it('replace 目标不存在时按新增平台包继续上传', async () => {
    const fixture = await createFixture()
    const logger = createLogger()
    const harness = createUploadHarness({
      credential: {
        region: 'oss-cn-hangzhou',
        bucket: 'release-bucket',
        objectKey: 'packages/mark-it.zip',
        expiration: '2026-11-11T12:00:00.000Z'
      },
      uploadTokenError: new CliError('替换目标不存在', 300400007)
    })

    const status = await runUpload({
      argv: [
        'upload',
        '--version',
        '1.6.0',
        '--platform',
        'macos',
        '--arch',
        'universal',
        '--file',
        fixture.file,
        '--replace'
      ],
      env: { APPHUB_MULTIPART_THRESHOLD_BYTES: '0' },
      dependencies: harness.dependencies,
      logger
    })

    expect(status).toBe(0)
    expect(harness.tokenRequests).toHaveLength(2)
    expect(harness.tokenRequests[0]).toMatchObject({ replaceExisting: true })
    expect(harness.tokenRequests[1]).not.toHaveProperty('replaceExisting')
    expect(harness.registerRequests).toHaveLength(1)
    expect(harness.registerRequests[0]).not.toHaveProperty('replaceExisting')
    expect(harness.dependencies.uploadMultipart).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledWith('  替换目标不存在，按新增平台包继续上传')
  })

  it('replace 遇到其它业务错误时仍直接失败', async () => {
    const fixture = await createFixture()
    const harness = createUploadHarness({
      credential: {
        region: 'oss-cn-hangzhou',
        bucket: 'release-bucket',
        objectKey: 'packages/mark-it.zip',
        expiration: '2026-11-11T12:00:00.000Z'
      },
      uploadTokenError: new CliError('签名校验失败', 403)
    })

    await expect(
      runUpload({
        argv: [
          'upload',
          '--version',
          '1.6.0',
          '--platform',
          'macos',
          '--file',
          fixture.file,
          '--replace'
        ],
        env: { APPHUB_MULTIPART_THRESHOLD_BYTES: '0' },
        dependencies: harness.dependencies,
        logger: createLogger()
      })
    ).rejects.toThrow('签名校验失败')

    expect(harness.tokenRequests).toHaveLength(1)
    expect(harness.dependencies.uploadMultipart).not.toHaveBeenCalled()
    expect(harness.registerRequests).toHaveLength(0)
  })

  it.each([1, 2])('第 %i 个对象传输失败时不登记包记录', async (failCall) => {
    const fixture = await createFixture({ blockmap: true })
    const uploadMultipart = vi.fn(async () => {
      if (uploadMultipart.mock.calls.length === failCall)
        throw new Error('simulated transfer failure')
    })
    const harness = createUploadHarness({
      credential: {
        region: 'oss-cn-hangzhou',
        bucket: 'release-bucket',
        objectKey: 'packages/mark-it.zip',
        blockmapObjectKey: 'packages/mark-it.zip.blockmap',
        expiration: '2026-11-11T12:00:00.000Z'
      },
      uploadMultipart
    })

    await expect(
      runUpload({
        argv: [
          'upload',
          '--version',
          '1.6.0',
          '--platform',
          'macos',
          '--file',
          fixture.file,
          '--blockmap',
          fixture.blockmap as string
        ],
        env: { APPHUB_MULTIPART_THRESHOLD_BYTES: '0' },
        dependencies: harness.dependencies,
        logger: createLogger()
      })
    ).rejects.toThrow('simulated transfer failure')

    expect(harness.registerRequests).toHaveLength(0)
  })

  it('运行日志与最终错误不包含账号、密码、JWT、STS、AccessKey 或签名', async () => {
    const fixture = await createFixture({ blockmap: true })
    const secrets = {
      username: 'release-user@example.test',
      password: 'PASSWORD-SECRET',
      jwt: 'eyJheader.payload.signature',
      securityToken: 'STS-SECRET-TOKEN',
      accessKeyId: 'LTAI12345678SECRET',
      accessKeySecret: 'ACCESS-KEY-SECRET',
      signature: 'SIGNATURE-SECRET'
    }
    const credential = {
      region: 'oss-cn-hangzhou',
      bucket: 'release-bucket',
      objectKey: 'packages/mark-it.zip',
      blockmapObjectKey: 'packages/mark-it.zip.blockmap',
      expiration: '2026-11-11T12:00:00.000Z',
      securityToken: secrets.securityToken,
      accessKeyId: secrets.accessKeyId,
      accessKeySecret: secrets.accessKeySecret
    }
    const harness = createUploadHarness({ credential })
    const logger = createLogger()

    await runUpload({
      argv: [
        'upload',
        '--version',
        '1.6.0',
        '--platform',
        'macos',
        '--file',
        fixture.file,
        '--blockmap',
        fixture.blockmap as string
      ],
      env: {
        APPHUB_USERNAME: secrets.username,
        APPHUB_PASSWORD: secrets.password,
        APPHUB_SIGN_SECRET: secrets.signature,
        APPHUB_MULTIPART_THRESHOLD_BYTES: '0'
      },
      dependencies: harness.dependencies,
      logger
    })

    const output = [...logger.log.mock.calls, ...logger.warn.mock.calls].flat().join('\n')
    const errorOutput = formatUploadError(
      new Error(
        `登录失败 username=${secrets.username} password=${secrets.password} Bearer ${secrets.jwt} securityToken=${secrets.securityToken} AccessKeyId=${secrets.accessKeyId} signature=${secrets.signature}`
      )
    )
    const combined = `${output}\n${errorOutput}`

    for (const secret of Object.values(secrets)) expect(combined).not.toContain(secret)
    expect(combined).toContain('[redacted]')
  })
})
