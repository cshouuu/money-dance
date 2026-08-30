import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WidgetSnapshot } from './widgetState'
import {
  ackWidgetActions,
  consumeWidgetLaunchTarget,
  getPendingWidgetActions,
  isWidgetBridgeAvailable,
  syncWidgetSnapshot,
} from './widgetBridge'

const snapshot: WidgetSnapshot = {
  version: 1,
  syncedAt: 1000,
  validUntil: 2000,
  secondRate: 0.01,
  workTimeline: [{ startAt: 1000, endAt: 2000, baseAmount: 1, ratePerSecond: 0.01 }],
}

describe('Android widget bridge', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is a no-op outside the Android native shell', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' })

    expect(isWidgetBridgeAvailable()).toBe(false)
    await expect(syncWidgetSnapshot(snapshot)).resolves.toBe(false)
    await expect(getPendingWidgetActions()).resolves.toEqual([])
    await expect(ackWidgetActions(['action-1'])).resolves.toBe(false)
  })

  it('does not call an installed native bridge on another platform', async () => {
    const nativePromise = vi.fn()
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'ios', nativePromise } })
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })

    expect(isWidgetBridgeAvailable()).toBe(false)
    await expect(syncWidgetSnapshot(snapshot)).resolves.toBe(false)
    expect(nativePromise).not.toHaveBeenCalled()
  })

  it('sends the snapshot JSON and decodes the native action journal', async () => {
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'getPendingActions') {
        return { actions: JSON.stringify([{
          actionId: 'action-1',
          type: 'slacking_start',
          occurredAt: 1000,
          sessionId: 'session-1',
        }]) }
      }
      if (method === 'consumeLaunchTarget') return { target: '/overtime?start=1' }
      return {}
    })
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', nativePromise } })
    vi.stubGlobal('navigator', { userAgent: 'Android' })

    await expect(syncWidgetSnapshot(snapshot, ['action-1', 'action-1', ''])).resolves.toBe(true)
    expect(nativePromise).toHaveBeenCalledWith('WidgetBridge', 'syncSnapshot', {
      snapshot: JSON.stringify(snapshot),
      appliedActionIds: ['action-1'],
    })
    await expect(getPendingWidgetActions()).resolves.toEqual([{
      actionId: 'action-1',
      type: 'slacking_start',
      occurredAt: 1000,
      sessionId: 'session-1',
    }])
    await expect(ackWidgetActions(['action-1', 'action-1'])).resolves.toBe(true)
    expect(nativePromise).toHaveBeenCalledWith('WidgetBridge', 'ackActions', { actionIds: ['action-1'] })
    await expect(consumeWidgetLaunchTarget()).resolves.toBe('/overtime?start=1')
  })
})
