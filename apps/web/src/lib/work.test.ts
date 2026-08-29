import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { summarizeTodayWork } from './work'

const profile = {
  ...DEFAULT_PROFILE,
  salary: 100,
  salaryType: 'daily' as const,
  workDaysPerWeek: 5,
}

const saturday = new Date(2026, 7, 29, 10, 0, 0)
const friday = new Date(2026, 7, 28, 10, 0, 0)

function scheduledRecord(): DailyWorkRecord {
  return { date: '2026-08-29', mode: 'scheduled', status: 'ended', sessions: [], updatedAt: saturday.toISOString() }
}

function attendance(record: Partial<AttendanceRecord>): AttendanceRecord[] {
  return [{ date: '2026-08-29', status: 'normal', updatedAt: saturday.toISOString(), ...record }]
}

describe('today workday rules', () => {
  it('does not auto-calculate salary on Saturday for a five-day schedule', () => {
    const summary = summarizeTodayWork(profile, [], saturday)
    expect(summary.dayType).toBe('rest')
    expect(summary.earnedAmount).toBe(0)
    expect(summary.workedSeconds).toBe(0)
  })

  it('continues auto-calculation on configured weekdays', () => {
    const summary = summarizeTodayWork(profile, [], friday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('allows Saturday when the profile is configured for six workdays', () => {
    const summary = summarizeTodayWork({ ...profile, workDaysPerWeek: 6 }, [], saturday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('auto-calculates a big-week Saturday and rests on the following small-week Saturday', () => {
    const alternatingProfile = {
      ...profile,
      workWeekMode: 'alternating' as const,
      alternatingAnchorDate: '2026-08-24',
      alternatingAnchorType: 'big' as const,
    }
    expect(summarizeTodayWork(alternatingProfile, [], saturday).dayType).toBe('work')
    expect(summarizeTodayWork(alternatingProfile, [], new Date(2026, 8, 5, 10)).dayType).toBe('rest')
  })

  it('allows a one-day scheduled override on Saturday', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('allows an explicit normal-attendance override on Saturday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'normal' }))
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('applies unpaid leave before the normal scheduled calculation', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday, undefined, attendance({ status: 'leave', leaveType: 'personal', payMode: 'unpaid' }))
    expect(summary.dayType).toBe('leave')
    expect(summary.earnedAmount).toBe(0)
  })

  it('applies paid leave using the configured multiplier', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'leave', leaveType: 'sick', payMode: 'multiplier', multiplier: 0.8 }))
    expect(summary.dayType).toBe('leave')
    expect(summary.earnedAmount).toBeCloseTo(calculateRates(profile).daily * 0.8)
  })

  it('does not calculate salary for an unpaid holiday', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday, undefined, attendance({ status: 'holiday', payMode: 'unpaid' }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBe(0)
  })

  it('uses the user-defined multiplier for a paid holiday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'holiday', payMode: 'multiplier', multiplier: 1.2 }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBeCloseTo(calculateRates(profile).daily * 1.2)
  })

  it('uses the user-defined fixed amount for a paid holiday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'holiday', payMode: 'fixed', fixedAmount: 88 }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBe(88)
  })
})
