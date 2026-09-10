import { DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import { getMonthlyWorkStats } from './monthlyStats'
import type { DailyWorkRecord } from '../types'

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
    expect(stats.workIncome).toBeCloseTo(stats.income - 500)
    expect(stats.averageHourlyIncome).toBeCloseTo((stats.income - 500) / 8)
  })

  it('keeps planned progress unchanged while adding overtime to the combined hourly rate', () => {
    const profile = { ...DEFAULT_PROFILE, monthlyRateBasis: 'average' as const, salary: 2175, salaryEffectiveDate: '2026-08-01' }
    const now = new Date(2026, 7, 3, 21)
    const session = {
      id: 'ot', startTime: new Date(2026, 7, 3, 18).toISOString(), endTime: new Date(2026, 7, 3, 20).toISOString(),
      startLocalDate: '2026-08-03', payMode: 'fixed' as const, fixedAmount: 50, earnedAmount: 50, durationSeconds: 7200,
    }
    const entry = { id: 'ot-ledger', linkedId: 'ot', kind: 'overtime' as const, direction: 'income' as const, amount: 50, occurredAt: session.startTime, localDate: '2026-08-03', source: '加班收入' }
    const before = getMonthlyWorkStats(profile, [], [], [], now)
    const stats = getMonthlyWorkStats(profile, [entry], [], [], now, { overtime: [session] })
    expect(stats.income).toBeCloseTo(150)
    expect(stats.workIncome).toBeCloseTo(150)
    expect(stats.totalWorkedSeconds).toBe(10 * 3600)
    expect(stats.averageHourlyIncome).toBeCloseTo(15)
    expect(stats.progress).toBe(before.progress)
    expect(stats.workedSeconds).toBe(before.workedSeconds)

    const flexible: DailyWorkRecord = {
      date: '2026-08-03', mode: 'flexible', status: 'ended', settlementMode: 'full-day', settlementVersion: 2,
      updatedAt: now.toISOString(), overtimeSessionId: 'ot', sessions: [
        { id: 'morning', startTime: new Date(2026, 7, 3, 9).toISOString(), endTime: new Date(2026, 7, 3, 12).toISOString() },
        { id: 'afternoon', startTime: new Date(2026, 7, 3, 13).toISOString(), endTime: session.endTime },
      ],
    }
    const overlap = getMonthlyWorkStats(profile, [entry], [flexible], [], now, { overtime: [session] })
    expect(overlap.totalWorkedSeconds).toBe(10 * 3600)
    expect(overlap.workedSeconds).toBe(8 * 3600)
    expect(overlap.progress).toBe(before.progress)
    expect(overlap.workIncome).toBeCloseTo(150)
  })
})
