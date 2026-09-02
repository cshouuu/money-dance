import { DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import type { ChinaHolidaySettings } from './attendance'
import { calculatePaidTimeEarnings, estimatePaidEarningsCompletionDate, estimatePaidWorkCompletionDate, scheduledPaidIntervalsForDate } from './paidTime'

const noHolidays: ChinaHolidaySettings = {
  enabled: false,
  effectiveFrom: '2026-01-01',
  dataVersion: 'test',
}

describe('paid time intervals', () => {
  it('removes an unpaid lunch from a slacking interval', () => {
    const result = calculatePaidTimeEarnings(
      { ...DEFAULT_PROFILE, monthlyRateBasis: 'average' },
      new Date(2026, 7, 3, 11, 30),
      new Date(2026, 7, 3, 13, 30),
      [],
      [],
      noHolidays,
    )
    expect(result.elapsedSeconds).toBe(2 * 3600)
    expect(result.paidSeconds).toBe(3600)
    expect(result.earnedAmount).toBeCloseTo(3600 * (15000 / 21.75 / 8 / 3600), 8)
  })

  it('keeps lunch when the break is paid and excludes time after work', () => {
    const paidLunch = calculatePaidTimeEarnings(
      { ...DEFAULT_PROFILE, monthlyRateBasis: 'average', paidBreak: true },
      new Date(2026, 7, 3, 11, 30),
      new Date(2026, 7, 3, 13, 30),
      [],
      [],
      noHolidays,
    )
    const afterWork = calculatePaidTimeEarnings(
      { ...DEFAULT_PROFILE, monthlyRateBasis: 'average' },
      new Date(2026, 7, 3, 18, 0),
      new Date(2026, 7, 3, 19, 0),
      [],
      [],
      noHolidays,
    )
    expect(paidLunch.paidSeconds).toBe(2 * 3600)
    expect(afterWork.paidSeconds).toBe(0)
  })

  it('uses only recorded flexible-work sessions', () => {
    const workRecords = [{
      date: '2026-08-03',
      mode: 'flexible' as const,
      status: 'ended' as const,
      sessions: [
        { id: 'a', startTime: new Date(2026, 7, 3, 9).toISOString(), endTime: new Date(2026, 7, 3, 10).toISOString() },
        { id: 'b', startTime: new Date(2026, 7, 3, 13).toISOString(), endTime: new Date(2026, 7, 3, 14).toISOString() },
      ],
      updatedAt: new Date(2026, 7, 3, 14).toISOString(),
    }]
    const result = calculatePaidTimeEarnings(
      { ...DEFAULT_PROFILE, monthlyRateBasis: 'average', defaultWorkMode: 'flexible' },
      new Date(2026, 7, 3, 9, 30),
      new Date(2026, 7, 3, 13, 30),
      workRecords,
      [],
      noHolidays,
    )
    expect(result.paidSeconds).toBe(3600)
  })

  it('builds overnight shift slices on the starting business date', () => {
    const intervals = scheduledPaidIntervalsForDate({
      ...DEFAULT_PROFILE,
      workStartTime: '22:00',
      workEndTime: '06:00',
      paidBreak: true,
    }, '2026-08-03')
    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.start).toEqual(new Date(2026, 7, 3, 22))
    expect(intervals[0]?.end).toEqual(new Date(2026, 7, 4, 6))
  })

  it('estimates completion across lunch and a weekend', () => {
    const completion = estimatePaidWorkCompletionDate(
      DEFAULT_PROFILE,
      new Date(2026, 7, 7, 17),
      3 * 3600,
      [],
      noHolidays,
    )
    expect(completion).toEqual(new Date(2026, 7, 10, 11))
  })

  it('estimates an earnings target across lunch and a weekend', () => {
    const profile = { ...DEFAULT_PROFILE, monthlyRateBasis: 'average' as const }
    const secondRate = 15000 / 21.75 / 8 / 3600
    const completion = estimatePaidEarningsCompletionDate(
      profile,
      new Date(2026, 7, 7, 17),
      3 * 3600 * secondRate,
      [],
      noHolidays,
    )
    expect(completion).toEqual(new Date(2026, 7, 10, 11))
  })
})
