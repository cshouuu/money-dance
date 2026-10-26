import { afterEach, describe, expect, it, vi } from 'vitest'
import { harmonyFile } from './harmony'

afterEach(() => vi.unstubAllGlobals())
describe('HarmonyOS backup callback bridge', () => {
  it('preserves UTF-8 backup content and waits for native completion', async () => {
    const save = vi.fn()
    vi.stubGlobal('window', { MoneyDanceHarmony: { save, open: vi.fn() } })
    const result = harmonyFile('save', '{"工资":19000}', '备份.json')
    const id = save.mock.calls[0][0]
    expect(save).toHaveBeenCalledWith(id, '{"工资":19000}', '备份.json')
    window.moneyDanceHarmonyResult!(id, {})
    expect(await result).toEqual({})
  })
  it('matches concurrent replies by request ID and preserves cancellation', async () => {
    const open = vi.fn()
    vi.stubGlobal('window', { MoneyDanceHarmony: { save: vi.fn(), open } })
    const first = harmonyFile('open')
    const second = harmonyFile('open')
    window.moneyDanceHarmonyResult!(open.mock.calls[1][0], { cancelled: true })
    window.moneyDanceHarmonyResult!(open.mock.calls[0][0], { text: '{"工资":1}' })
    expect(await first).toEqual({ text: '{"工资":1}' })
    expect(await second).toEqual({ cancelled: true })
  })
  it('reports native errors and unavailable bridges instead of download success', async () => {
    const open = vi.fn()
    vi.stubGlobal('window', { MoneyDanceHarmony: { save: vi.fn(), open } })
    const result = harmonyFile('open')
    window.moneyDanceHarmonyResult!(open.mock.calls[0][0], { error: '无法读取备份' })
    await expect(result).rejects.toThrow('无法读取备份')
    vi.stubGlobal('window', {})
    await expect(harmonyFile('save', '{}', 'a.json')).rejects.toThrow('尚未就绪')
  })
})
