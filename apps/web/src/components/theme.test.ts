import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME_ID, isThemeId, loadThemeId, syncNativeCanvas, THEMES } from './theme'

describe('theme preferences', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defines every palette once and accepts only known theme ids', () => {
    expect(new Set(THEMES.map(theme => theme.id)).size).toBe(THEMES.length)
    expect(THEMES).toHaveLength(12)
    expect(THEMES.every(theme => theme.colors.every(color => /^#[0-9A-F]{6}$/.test(color)))).toBe(true)
    expect(isThemeId('rose-moon')).toBe(true)
    expect(isThemeId('unknown-theme')).toBe(false)
  })

  it('falls back to the classic theme when stored data is invalid', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify('unknown-theme') })
    expect(loadThemeId()).toBe(DEFAULT_THEME_ID)
  })

  it('sends the Android canvas without invoking native APIs on web', () => {
    const nativePromise = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'web', nativePromise } })
    syncNativeCanvas('#FAF7F2')
    expect(nativePromise).not.toHaveBeenCalled()
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', nativePromise } })
    syncNativeCanvas('#FAF7F2')
    expect(nativePromise).toHaveBeenCalledWith('Appearance', 'setCanvas', { color: '#FAF7F2' })
  })

  it('continues on old shells with a missing appearance plugin', async () => {
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', nativePromise: () => Promise.reject(new Error('unimplemented')) } })
    expect(() => syncNativeCanvas('#FAF7F2')).not.toThrow()
    await Promise.resolve()
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', nativePromise: () => { throw new Error('unimplemented') } } })
    expect(() => syncNativeCanvas('#FAF7F2')).not.toThrow()
  })
})
