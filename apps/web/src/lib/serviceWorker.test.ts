import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerMoneyDanceServiceWorker } from './serviceWorker'

afterEach(() => vi.unstubAllGlobals())

function registrationFixture(waiting: { postMessage: ReturnType<typeof vi.fn> } | null) {
  return {
    waiting,
    installing: null as null | {
      state: ServiceWorkerState
      addEventListener: ReturnType<typeof vi.fn>
    },
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
  }
}

describe('service worker updates', () => {
  it('leaves a ready update waiting until all existing clients close', async () => {
    const waiting = { postMessage: vi.fn() }
    const registration = registrationFixture(waiting)
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    }
    const dispatchEvent = vi.fn()
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { dispatchEvent, location: { reload } })

    await registerMoneyDanceServiceWorker()

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(registration.update).toHaveBeenCalledOnce()
    expect(waiting.postMessage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: 'money-dance:update-ready' })
  })

  it('does not announce the first worker as an application update', async () => {
    const registration = registrationFixture(null)
    const serviceWorker = {
      controller: null,
      register: vi.fn().mockResolvedValue(registration),
    }
    const dispatchEvent = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { dispatchEvent })

    await registerMoneyDanceServiceWorker()

    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('announces an installed candidate without activating or reloading it', async () => {
    let updateFound: (() => void) | undefined
    let stateChange: (() => void) | undefined
    const registration = registrationFixture(null)
    const worker = {
      state: 'installing' as ServiceWorkerState,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'statechange') stateChange = listener
      }),
      postMessage: vi.fn(),
    }
    registration.addEventListener.mockImplementation((type: string, listener: () => void) => {
      if (type === 'updatefound') updateFound = listener
    })
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    }
    const dispatchEvent = vi.fn()
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { dispatchEvent, location: { reload } })

    await registerMoneyDanceServiceWorker()
    registration.installing = worker
    updateFound?.()
    worker.state = 'installed'
    stateChange?.()

    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })

  it('ignores a failed manual update check after registration succeeds', async () => {
    const registration = registrationFixture(null)
    registration.update.mockRejectedValue(new Error('offline'))
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    }
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })

    await expect(registerMoneyDanceServiceWorker()).resolves.toBeUndefined()
  })
})
