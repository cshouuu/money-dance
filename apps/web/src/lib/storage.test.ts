import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadArray, loadRecordArray, STORAGE_CHANGED_EVENT, removeJSON, saveJSON } from './storage'

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

describe('defensive storage reads', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['null', '{}', '"legacy"', '42'])('uses an empty array for an invalid %s container without overwriting it', raw => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem })

    expect(loadArray('salary-flow.test')).toEqual([])
    expect(setItem).not.toHaveBeenCalled()
  })

  it('keeps valid records and ignores malformed array items', () => {
    const raw = JSON.stringify([{ id: 'valid', amount: 8 }, null, 'legacy', { id: 4 }])
    vi.stubGlobal('localStorage', { getItem: () => raw })

    expect(loadRecordArray<{ id: string; amount: number }>(
      'salary-flow.test',
      value => typeof value.id === 'string' && typeof value.amount === 'number',
    )).toEqual([{ id: 'valid', amount: 8 }])
  })
})
