import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_CHANGED_EVENT, removeJSON, saveJSON } from './storage'

describe('storage writes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not interrupt an action when Safari rejects a write', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new DOMException('blocked', 'QuotaExceededError') } })
    expect(saveJSON('test', { value: 1 })).toBe(false)
  })

  it('does not interrupt an action when Safari rejects a removal', () => {
    vi.stubGlobal('localStorage', { removeItem: () => { throw new DOMException('blocked', 'SecurityError') } })
    expect(removeJSON('test')).toBe(false)
  })

  it('notifies same-window listeners after a successful write and removal', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal('localStorage', { setItem: vi.fn(), removeItem: vi.fn() })

    expect(saveJSON('salary-flow.test', { value: 1 })).toBe(true)
    expect(removeJSON('salary-flow.test')).toBe(true)
    expect(dispatchEvent).toHaveBeenCalledTimes(2)
    expect(dispatchEvent.mock.calls.map(([event]) => ({
      type: (event as CustomEvent).type,
      detail: (event as CustomEvent).detail,
    }))).toEqual([
      { type: STORAGE_CHANGED_EVENT, detail: { key: 'salary-flow.test' } },
      { type: STORAGE_CHANGED_EVENT, detail: { key: 'salary-flow.test' } },
    ])
  })
})
