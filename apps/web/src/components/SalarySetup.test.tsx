import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { hasSavedSalaryProfile, loadProfile, saveProfile } from '../lib/profile'
import { keys } from '../lib/storage'
import App from '../App'

vi.mock('../lib/harmony', async importOriginal => ({ ...await importOriginal<object>(), isHarmonyBuild: true }))
afterEach(() => vi.unstubAllGlobals())

function storage() {
  const data = new Map<string, string>()
  const setItem = vi.fn((key: string, value: string) => data.set(key, value))
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem })
  return { data, setItem }
}

describe('HarmonyOS first launch', () => {
  it('renders an empty salary form without starting business pages or persisting defaults', () => {
    const { data, setItem } = storage()
    expect(hasSavedSalaryProfile()).toBe(false)
    const html = renderToStaticMarkup(<App/>)
    expect(html).toContain('从你的真实工资开始')
    expect(html).toContain('选择适合这份工作的方式')
    expect(html).toContain('小时兼职')
    expect(html).toContain('继续设置')
    expect(html).not.toContain('15000')
    expect(html).not.toContain('今日已经赚了')
    expect(setItem).not.toHaveBeenCalled()
    expect(data.size).toBe(0)
  })

  it.each([0, 8500, 15000])('keeps an existing user salary of %s and does not mistake it for demo data', salary => {
    const { data, setItem } = storage()
    data.set(keys.profile, JSON.stringify({ ...DEFAULT_PROFILE, salary }))
    expect(hasSavedSalaryProfile()).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('persists the supplied salary across reloads without adding sample records', () => {
    const { data } = storage()
    expect(saveProfile({ ...DEFAULT_PROFILE, salary: 8200, salaryEffectiveDate: '2026-09-24' })).not.toBeNull()
    expect(hasSavedSalaryProfile()).toBe(true)
    expect(loadProfile().salary).toBe(8200)
    expect([...data.keys()]).toEqual([keys.profile])
  })

  it('does not complete setup if device storage refuses the save', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('full') } })
    expect(saveProfile({ ...DEFAULT_PROFILE, salary: 8200 })).toBeNull()
    expect(hasSavedSalaryProfile()).toBe(false)
  })
})
