import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerMoneyDanceServiceWorker } from './serviceWorker'

afterEach(() => vi.unstubAllGlobals())

function registrationFixture(waiting: { postMessage: ReturnType<typeof vi.fn> } | null) {
  return {
    waiting,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
  }
}

describe('service worker updates', () => {
  it('activates a fully installed update once and reloads only after controller change', async () => {
    const waiting = { postMessage: vi.fn() }
    const registration = registrationFixture(waiting)
    let controllerChange: (() => void) | undefined
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'controllerchange') controllerChange = listener
      }),
    }
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { location: { reload } })

    await registerMoneyDanceServiceWorker()

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(waiting.postMessage).toHaveBeenCalledOnce()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()
    controllerChange?.()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload the current page when the first worker claims it', async () => {
    const registration = registrationFixture(null)
    let controllerChange: (() => void) | undefined
    const serviceWorker = {
      controller: null,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'controllerchange') controllerChange = listener
      }),
    }
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', { location: { reload } })

    await registerMoneyDanceServiceWorker()
    controllerChange?.()

    expect(reload).not.toHaveBeenCalled()
  })
})
