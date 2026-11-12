import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState, UpdateStatus } from '../../../shared/update-types'
import { useUpdateStore } from './update'

function createState(status: UpdateStatus): UpdateState {
  return {
    status,
    currentVersion: '1.6.0',
    currentChannel: 'stable',
    betaUpdatesEnabled: false,
    latestVersion: status === 'available' ? '1.7.0' : undefined,
    forceUpdate: false
  }
}

function setupUpdateApi(status: UpdateStatus): {
  store: ReturnType<typeof useUpdateStore>
  check: ReturnType<typeof vi.fn>
  openWindow: ReturnType<typeof vi.fn>
  emitState: (next: UpdateState) => void
  emitNoticeAllowed: (allowed: boolean) => void
} {
  const check = vi.fn(async (): Promise<UpdateState> => createState(status))
  const openWindow = vi.fn(async (): Promise<void> => {})
  let stateListener: ((next: UpdateState) => void) | null = null
  let noticeListener: ((allowed: boolean) => void) | null = null

  vi.stubGlobal('window', {
    api: {
      update: {
        check,
        openWindow,
        getState: async (): Promise<UpdateState> => createState(status),
        onState: (callback: (next: UpdateState) => void): (() => void) => {
          stateListener = callback
          return () => {}
        },
        onNoticeAllowed: (callback: (allowed: boolean) => void): (() => void) => {
          noticeListener = callback
          return () => {}
        }
      }
    }
  })
  setActivePinia(createPinia())

  return {
    store: useUpdateStore(),
    check,
    openWindow,
    emitState: (next) => stateListener?.(next),
    emitNoticeAllowed: (allowed) => noticeListener?.(allowed)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useUpdateStore.checkAndOpenIfAvailable', () => {
  it('opens the update window when a new version is available', async () => {
    const { store, check, openWindow } = setupUpdateApi('available')

    await store.checkAndOpenIfAvailable()

    expect(check).toHaveBeenCalledOnce()
    expect(openWindow).toHaveBeenCalledOnce()
  })

  it('stays on the settings page when already up to date', async () => {
    const { store, check, openWindow } = setupUpdateApi('not-available')

    await store.checkAndOpenIfAvailable()

    expect(check).toHaveBeenCalledOnce()
    expect(openWindow).not.toHaveBeenCalled()
  })
})

describe('useUpdateStore 提示可见性', () => {
  it('设置页发起的检测不会在编辑窗口弹出提示', async () => {
    const { store, emitState, emitNoticeAllowed } = setupUpdateApi('idle')
    store.init()
    await Promise.resolve()

    // 主进程在检测开始前下发抑制，随后才广播 available
    emitNoticeAllowed(false)
    emitState(createState('available'))

    expect(store.showNotice).toBe(false)
  })

  it('更新详情窗口打开后立即隐藏已有提示', async () => {
    const { store, emitState, emitNoticeAllowed } = setupUpdateApi('idle')
    store.init()
    await Promise.resolve()

    emitState(createState('available'))
    expect(store.showNotice).toBe(true)

    emitNoticeAllowed(false)
    expect(store.showNotice).toBe(false)
  })

  it('抑制解除后新发现的版本仍可正常提示', async () => {
    const { store, emitState, emitNoticeAllowed } = setupUpdateApi('idle')
    store.init()
    await Promise.resolve()

    emitNoticeAllowed(false)
    emitNoticeAllowed(true)
    emitState(createState('available'))

    expect(store.showNotice).toBe(true)
  })

  it('打开更新详情窗口时先隐藏本窗口提示', async () => {
    const { store, openWindow, emitState } = setupUpdateApi('idle')
    store.init()
    await Promise.resolve()
    emitState(createState('available'))

    await store.openWindow()

    expect(openWindow).toHaveBeenCalledOnce()
    expect(store.showNotice).toBe(false)
  })
})
