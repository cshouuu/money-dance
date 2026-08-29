import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import { alternatingWeekTypeForDate, attendanceStatusLabel, getWeekStartDateValue, isConfiguredWorkday } from './attendance'

const alternatingProfile: SalaryProfile = {
  ...DEFAULT_PROFILE,
  workWeekMode: 'alternating',
  alternatingAnchorDate: '2026-08-24',
  alternatingAnchorType: 'big',
}

describe('alternating workweek', () => {
  it('normalizes a date to the local Monday', () => {
    expect(getWeekStartDateValue(new Date(2026, 7, 29, 12))).toBe('2026-08-24')
  })

  it('works Monday through Saturday during a big week', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 7, 29, 12), alternatingProfile)).toBe('big')
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), alternatingProfile)).toBe(true)
    expect(isConfiguredWorkday(new Date(2026, 7, 30, 12), alternatingProfile)).toBe(false)
  })

  it('rests on Saturday during the following small week', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 8, 5, 12), alternatingProfile)).toBe('small')
    expect(isConfiguredWorkday(new Date(2026, 8, 5, 12), alternatingProfile)).toBe(false)
  })

  it('alternates correctly before the anchor and across years', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 7, 22, 12), alternatingProfile)).toBe('small')
    expect(alternatingWeekTypeForDate(new Date(2027, 0, 2, 12), alternatingProfile)).toBe('big')
    expect(alternatingWeekTypeForDate(new Date(2027, 0, 9, 12), alternatingProfile)).toBe('small')
  })

  it('supports anchoring the current week as a small week', () => {
    const profile = { ...alternatingProfile, alternatingAnchorType: 'small' as const }
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), profile)).toBe(false)
    expect(isConfiguredWorkday(new Date(2026, 8, 5, 12), profile)).toBe(true)
  })

  it('keeps the existing fixed workweek behavior', () => {
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), { ...DEFAULT_PROFILE, workDaysPerWeek: 5 })).toBe(false)
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), { ...DEFAULT_PROFILE, workDaysPerWeek: 6 })).toBe(true)
  })
})

describe('attendanceStatusLabel', () => {
  it('distinguishes paid and unpaid holidays', () => {
    expect(attendanceStatusLabel({ date: '2026-08-29', status: 'holiday', payMode: 'multiplier', multiplier: 1, updatedAt: '' })).toBe('带薪假')
    expect(attendanceStatusLabel({ date: '2026-08-29', status: 'holiday', payMode: 'unpaid', updatedAt: '' })).toBe('无薪假')
  })
})
