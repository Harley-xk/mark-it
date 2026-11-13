import { describe, expect, it } from 'vitest'
import {
  ActivityApiError,
  ACTIVITY_REPORT_PATH,
  buildActivityHeaders,
  buildActivitySignString,
  detectActivityPlatform,
  normalizeActivityArch,
  parseActivityResponse
} from './activity-protocol'

describe('上报签名', () => {
  it('签名串应为五段换行连接', () => {
    expect(buildActivitySignString('post', '/api/open/app/activity/report', '{}', '1', 'n')).toBe(
      'POST\n/api/open/app/activity/report\n{}\n1\nn'
    )
  })

  it('应对固定输入生成固定 HMAC-SHA256 签名', () => {
    const headers = buildActivityHeaders(
      'test-device',
      '{"deviceId":"test-device"}',
      'test-secret',
      { timestamp: '1700000000000', noncestr: 'abc123' }
    )
    expect(headers.sign).toBe('cbc842c8c26e575177f214e13b54656b61fd4f80c7f6273ba6d3699fa057d643')
    expect(headers.timestamp).toBe('1700000000000')
    expect(headers.noncestr).toBe('abc123')
  })

  it('应携带与请求体一致的设备头与应用标识', () => {
    const headers = buildActivityHeaders('device-1', '{}', 'secret')
    expect(headers['X-Device-Id']).toBe('device-1')
    expect(headers['X-App-Key']).toBe('ah_q100pquj6kxxj9at')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.sign).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('平台与架构映射', () => {
  it('应映射三个发布平台', () => {
    expect(detectActivityPlatform('win32')).toBe('windows')
    expect(detectActivityPlatform('darwin')).toBe('macos')
    expect(detectActivityPlatform('linux')).toBe('linux')
    expect(detectActivityPlatform('freebsd')).toBeNull()
  })

  it('应裁剪架构空白并拒绝超长值', () => {
    expect(normalizeActivityArch(' x64 ')).toBe('x64')
    expect(normalizeActivityArch('arm64')).toBe('arm64')
    expect(normalizeActivityArch('')).toBeUndefined()
    expect(normalizeActivityArch('a'.repeat(17))).toBeUndefined()
  })
})

describe('响应解析', () => {
  it('应解析成功响应', () => {
    expect(
      parseActivityResponse(
        { code: 0, message: 'ok', data: { accepted: 4, ignored: 0, memberResolved: false } },
        200
      )
    ).toEqual({ accepted: 4, ignored: 0, memberResolved: false })
  })

  it('业务错误应抛出带 code 与 status 的异常', () => {
    try {
      parseActivityResponse({ code: 700300003, message: '应用已停用' }, 400)
      throw new Error('should not reach')
    } catch (error) {
      expect(error).toBeInstanceOf(ActivityApiError)
      const apiError = error as ActivityApiError
      expect(apiError.code).toBe(700300003)
      expect(apiError.status).toBe(400)
      expect(apiError.message).toBe('应用已停用')
    }
  })

  it('非 JSON 响应应视为错误，保留队列重试', () => {
    expect(() => parseActivityResponse(null, 502)).toThrow(ActivityApiError)
    expect(() => parseActivityResponse('oops', 400)).toThrow(ActivityApiError)
  })

  it('缺少 data 时返回零值而不是抛错', () => {
    expect(parseActivityResponse({ code: 0 }, 200)).toEqual({
      accepted: 0,
      ignored: 0,
      memberResolved: false
    })
  })

  it('上报路径应包含 /api 前缀', () => {
    expect(ACTIVITY_REPORT_PATH.startsWith('/api/')).toBe(true)
  })
})
