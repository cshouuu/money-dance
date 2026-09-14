import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasSavedProfile } from './setup'

afterEach(() => vi.unstubAllGlobals())
describe('first use detection', () => {
  it.each([null, '{}', 'null', '[]', '{broken'])('starts setup without a usable stored profile (%s)', value => {
    vi.stubGlobal('localStorage', { getItem: () => value })
    expect(hasSavedProfile()).toBe(false)
  })
  it.each([0, 15000, 28000])('does not re-onboard or overwrite an existing salary of %s', salary => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ salary }), setItem })
    expect(hasSavedProfile()).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
  })
})
