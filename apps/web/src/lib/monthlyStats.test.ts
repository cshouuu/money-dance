import { DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import { getMonthlyWorkStats } from './monthlyStats'

describe('monthly work stats', () => {
  it('accumulates completed scheduled work and the current partial day', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      monthlyRateBasis: 'average' as const,
      salary: 2175,
      salaryEffectiveDate: '2026-08-01',
    }
    const stats = getMonthlyWorkStats(profile, [], [], [], new Date(2026, 7, 4, 10))

    expect(stats.workedSeconds).toBe(9 * 3600)
    expect(stats.workdayCount).toBe(21)
    expect(stats.plannedSeconds).toBe(21 * 8 * 3600)
    expect(stats.income).toBeCloseTo(112.5)
    expect(stats.expectedIncome).toBeCloseTo(2175)
    expect(stats.averageHourlyIncome).toBeCloseTo(12.5)
  })

  it('includes confirmed additional income in earned and expected totals', () => {
    const profile = { ...DEFAULT_PROFILE, monthlyRateBasis: 'average' as const, salaryEffectiveDate: '2026-08-01' }
    const extra = [{
      id: 'extra',
      kind: 'manual' as const,
      direction: 'income' as const,
      amount: 500,
      source: '兼职',
      occurredAt: new Date(2026, 7, 3, 12).toISOString(),
    }]
    const stats = getMonthlyWorkStats(profile, extra, [], [], new Date(2026, 7, 3, 18))
    expect(stats.income).toBeGreaterThan(500)
    expect(stats.expectedIncome).toBeCloseTo(15500)
  })
})
