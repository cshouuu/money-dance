import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeJSON, saveJSON } from './storage'

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
})
