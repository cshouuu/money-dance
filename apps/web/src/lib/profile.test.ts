import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALTERNATING_MONTHLY_WORK_DAYS, livingCostConfigurationForDate, loadProfile, normalizeLivingCostMode, normalizeSalaryHistoryMode, recommendedMonthlyWorkDays, saveProfile } from './profile'

afterEach(() => vi.unstubAllGlobals())

describe('recommendedMonthlyWorkDays', () => {
  it.each([
    [5, 21.67],
    [6, 26],
    [7, 30.33],
  ])('recommends a monthly value for %i work days per week', (weekly, monthly) => {
    expect(recommendedMonthlyWorkDays(weekly)).toBe(monthly)
  })

  it('recommends the average of five-day and six-day weeks for an alternating schedule', () => {
    expect(ALTERNATING_MONTHLY_WORK_DAYS).toBe(23.83)
  })
})

describe('normalizeSalaryHistoryMode', () => {
  it.each(['month', 'year', 'custom'])('migrates %s to a custom history range', mode => {
    expect(normalizeSalaryHistoryMode(mode)).toBe('custom')
  })

  it('keeps disabled or unknown history settings disabled', () => {
    expect(normalizeSalaryHistoryMode('none')).toBe('none')
    expect(normalizeSalaryHistoryMode(undefined)).toBe('none')
  })
})

describe('normalizeLivingCostMode', () => {
  it('keeps the daily ledger option', () => {
    expect(normalizeLivingCostMode('daily-ledger')).toBe('daily-ledger')
  })

  it.each([undefined, null, 'deduct', 'unknown'])('keeps legacy value %s on rate deduction', value => {
    expect(normalizeLivingCostMode(value)).toBe('deduct')
  })

  it('migrates an existing profile without changing its disposable rate', () => {
    const legacyProfile = {
      includeLivingCost: true,
      monthlyLivingCost: 3000,
      salary: 15000,
      salaryType: 'monthly',
      salaryHistoryMode: 'none',
      salaryEffectiveDate: '2026-08-01',
      defaultWorkMode: 'scheduled',
      workWeekMode: 'fixed',
      alternatingAnchorDate: '2026-08-24',
      alternatingAnchorType: 'big',
    }
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(legacyProfile), setItem })

    const migrated = loadProfile()

    expect(migrated.livingCostMode).toBe('deduct')
    expect(migrated.livingCostHistory).toEqual([])
    expect(calculateRates(migrated).daily).toBeCloseTo((15000 - 3000) / 21.75, 8)
    expect(setItem).toHaveBeenCalled()
  })

  it('migrates an unreleased daily-ledger profile from today instead of salaryEffectiveDate', () => {
    const stored = {
      ...DEFAULT_PROFILE,
      includeLivingCost: true,
      monthlyLivingCost: 1000,
      livingCostMode: 'daily-ledger',
      livingCostHistory: undefined,
      salaryEffectiveDate: '2025-01-01',
    }
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(stored), setItem })

    const migrated = loadProfile(new Date(2026, 7, 31, 18))

    expect(migrated.livingCostHistory).toEqual([{
      version: 1,
      effectiveFrom: '2026-08-31',
      mode: 'daily-ledger',
      monthlyAmount: 1000,
    }])
  })

  it('does not change living-cost history when unrelated settings are saved', () => {
    let serialized = ''
    vi.stubGlobal('localStorage', {
      getItem: () => serialized || null,
      setItem: (_key: string, value: string) => { serialized = value },
    })
    const started = saveProfile({
      ...DEFAULT_PROFILE,
      includeLivingCost: true,
      monthlyLivingCost: 1000,
      livingCostMode: 'daily-ledger',
    }, new Date(2026, 7, 1, 12))!
    const unrelatedSave = saveProfile({ ...started, workStartTime: '08:30', salaryEffectiveDate: '2026-08-20' }, new Date(2026, 7, 20, 12))!

    expect(unrelatedSave.livingCostHistory).toEqual(started.livingCostHistory)
    expect(unrelatedSave.livingCostHistory).toEqual([
      { version: 1, effectiveFrom: '2026-07-31', mode: 'off', monthlyAmount: 0 },
      { version: 1, effectiveFrom: '2026-08-01', mode: 'daily-ledger', monthlyAmount: 1000 },
    ])
  })

  it('records amount and mode changes from the current local date', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    const started = saveProfile({
      ...DEFAULT_PROFILE,
      includeLivingCost: true,
      monthlyLivingCost: 1000,
      livingCostMode: 'daily-ledger',
    }, new Date(2026, 7, 1, 12))!
    const changed = saveProfile({ ...started, monthlyLivingCost: 2000 }, new Date(2026, 7, 15, 12))!
    const stopped = saveProfile({ ...changed, includeLivingCost: false }, new Date(2026, 7, 20, 12))!

    expect(stopped.livingCostHistory).toEqual([
      { version: 1, effectiveFrom: '2026-07-31', mode: 'off', monthlyAmount: 0 },
      { version: 1, effectiveFrom: '2026-08-01', mode: 'daily-ledger', monthlyAmount: 1000 },
      { version: 1, effectiveFrom: '2026-08-15', mode: 'daily-ledger', monthlyAmount: 2000 },
      { version: 1, effectiveFrom: '2026-08-20', mode: 'off', monthlyAmount: 2000 },
    ])
  })

  it('preserves the legacy deduct baseline when daily ledger is first selected', () => {
    let serialized = JSON.stringify({
      ...DEFAULT_PROFILE,
      includeLivingCost: true,
      monthlyLivingCost: 310,
      livingCostMode: 'deduct',
      livingCostHistory: [],
      salaryEffectiveDate: '2026-08-01',
    })
    vi.stubGlobal('localStorage', {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => { serialized = value },
    })

    const switched = saveProfile({
      ...JSON.parse(serialized),
      livingCostMode: 'daily-ledger',
    }, new Date(2026, 7, 15, 12))!

    expect(switched.livingCostHistory).toEqual([
      { version: 1, effectiveFrom: '2026-08-01', mode: 'deduct', monthlyAmount: 310 },
      { version: 1, effectiveFrom: '2026-08-15', mode: 'daily-ledger', monthlyAmount: 310 },
    ])
    expect(livingCostConfigurationForDate(switched, '2026-08-14').mode).toBe('deduct')
    expect(livingCostConfigurationForDate(switched, '2026-08-15').mode).toBe('daily-ledger')
  })

  it('reports a failed profile persistence instead of pretending it was saved', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
    })

    expect(saveProfile(DEFAULT_PROFILE)).toBeNull()
  })
})
