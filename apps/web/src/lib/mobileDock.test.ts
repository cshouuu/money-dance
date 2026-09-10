import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DOCK_PATHS, loadDockPaths, normalizeDockPaths, saveDockPaths, setDockSlot, subscribeDockPaths } from './mobileDock'
import { type NavigationPath } from './navigation'
import { keys, STORAGE_CHANGED_EVENT } from './storage'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

describe('mobile dock preferences', () => {
  it('keeps the original four entries for new users and unreadable storage', () => {
    expect(loadDockPaths()).toEqual(DEFAULT_DOCK_PATHS)
    data.set(keys.mobileDock, '{broken')
    expect(loadDockPaths()).toEqual(DEFAULT_DOCK_PATHS)
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(loadDockPaths()).toEqual(DEFAULT_DOCK_PATHS)
  })

  it('repairs duplicate, missing and removed entries while preserving valid choices', () => {
    expect(normalizeDockPaths(['/journey', '/journey', '/missing', null, '/attendance'])).toEqual(['/journey', '/attendance', '/', '/slacking'])
    expect(normalizeDockPaths({ items: ['/assets'] })).toEqual(DEFAULT_DOCK_PATHS)
  })

  it('replaces a slot or swaps an already chosen entry without duplicates', () => {
    const changed = setDockSlot(DEFAULT_DOCK_PATHS, 0, '/journey')
    expect(changed).toEqual(['/journey', '/slacking', '/overtime', '/settings'])
    expect(setDockSlot(changed, 1, '/settings')).toEqual(['/journey', '/settings', '/overtime', '/slacking'])
    expect(DEFAULT_DOCK_PATHS).toEqual(['/', '/slacking', '/overtime', '/settings'])
  })

  it('persists custom ordering and notifies the dock immediately', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeDockPaths(onChange)
    const paths: NavigationPath[] = ['/journey', '/attendance', '/summary', '/assets']
    expect(saveDockPaths(paths)).toBe(true)
    expect(loadDockPaths()).toEqual(paths)
    expect(onChange).toHaveBeenCalledWith(paths)
    unsubscribe()
    saveDockPaths(DEFAULT_DOCK_PATHS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('syncs another tab or cleared storage and ignores unrelated profile writes', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeDockPaths(onChange)
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT, { detail: { key: keys.profile } }))
    expect(onChange).not.toHaveBeenCalled()
    data.set(keys.mobileDock, JSON.stringify(['/assets', '/summary', '/attendance', '/journey']))
    window.dispatchEvent(Object.assign(new Event('storage'), { key: keys.mobileDock }))
    expect(onChange).toHaveBeenLastCalledWith(['/assets', '/summary', '/attendance', '/journey'])
    data.clear()
    window.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_DOCK_PATHS)
    unsubscribe()
  })

  it('does not apply invalid choices or failed writes', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeDockPaths(onChange)
    expect(saveDockPaths(['/journey'])).toBe(false)
    expect(saveDockPaths(['/', '/', '/settings', '/assets'])).toBe(false)
    expect(saveDockPaths(['/', '/bad', '/settings', '/assets'] as NavigationPath[])).toBe(false)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(saveDockPaths(['/journey', '/attendance', '/summary', '/assets'])).toBe(false)
    expect(loadDockPaths()).toEqual(DEFAULT_DOCK_PATHS)
    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('restores the original ordering after customization', () => {
    saveDockPaths(['/journey', '/attendance', '/summary', '/assets'])
    expect(saveDockPaths(DEFAULT_DOCK_PATHS)).toBe(true)
    expect(loadDockPaths()).toEqual(DEFAULT_DOCK_PATHS)
  })
})
