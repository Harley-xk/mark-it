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
} {
  const check = vi.fn(async (): Promise<UpdateState> => createState(status))
  const openWindow = vi.fn(async (): Promise<void> => {})

  vi.stubGlobal('window', {
    api: {
      update: {
        check,
        openWindow
      }
    }
  })
  setActivePinia(createPinia())

  return {
    store: useUpdateStore(),
    check,
    openWindow
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
