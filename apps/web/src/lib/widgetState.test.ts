import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { salaryProfileForBusinessDate } from './profile'
import { captureSessionStartBusinessDate } from './sessionBusinessDate'
import { buildWidgetSnapshot, buildWorkTimeline, type WidgetTimelineSegment } from './widgetState'

const profile = {
  ...DEFAULT_PROFILE,
  salary: 288,
  salaryType: 'daily' as const,
  workDaysPerWeek: 5,
}

afterEach(() => {
  vi.unstubAllEnvs()
})

function segmentAt(timeline: WidgetTimelineSegment[], date: Date) {
  const time = date.getTime()
  return timeline.find(segment => segment.startAt <= time && time < segment.endAt)
}

function amountAt(timeline: WidgetTimelineSegment[], date: Date): number | null {
  const segment = segmentAt(timeline, date)
  if (!segment) return null
  return segment.baseAmount + ((date.getTime() - segment.startAt) / 1000) * segment.ratePerSecond
}

function nextDayTimeline(record: DailyWorkRecord, attendanceRecords: AttendanceRecord[] = []) {
  return buildWorkTimeline({
    profile,
    workRecords: [record],
    attendanceRecords,
    rates: calculateRates(profile),
    startAt: new Date(2026, 7, 29, 0, 30).getTime(),
    endAt: new Date(2026, 7, 29, 1, 30).getTime(),
  })
}

describe('widget salary timeline', () => {
  it('compresses minute samples into work, break, and idle segments', () => {
    const start = new Date(2026, 7, 28, 8, 59, 30)
    const end = new Date(2026, 7, 28, 13, 0, 30)
    const rates = calculateRates(profile)
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [],
      attendanceRecords: [],
      rates,
      startAt: start.getTime(),
      endAt: end.getTime(),
    })

    expect(timeline).toHaveLength(4)
    expect(segmentAt(timeline, new Date(2026, 7, 28, 8, 59, 45))?.ratePerSecond).toBe(0)
    expect(segmentAt(timeline, new Date(2026, 7, 28, 10))?.ratePerSecond).toBeCloseTo(rates.second)
    expect(segmentAt(timeline, new Date(2026, 7, 28, 12, 30))?.ratePerSecond).toBe(0)
    expect(segmentAt(timeline, new Date(2026, 7, 28, 13, 0, 15))?.ratePerSecond).toBeCloseTo(rates.second)
    expect(amountAt(timeline, new Date(2026, 7, 28, 10))).toBeCloseTo(36)
  })

  it('preserves a midnight discontinuity instead of carrying yesterday salary forward', () => {
    const start = new Date(2026, 7, 28, 17, 59, 30)
    const end = new Date(2026, 7, 29, 0, 0, 30)
    const rates = calculateRates(profile)
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [],
      attendanceRecords: [],
      rates,
      startAt: start.getTime(),
      endAt: end.getTime(),
    })

    expect(amountAt(timeline, new Date(2026, 7, 28, 23, 59, 59))).toBeCloseTo(rates.daily)
    expect(amountAt(timeline, new Date(2026, 7, 29, 0, 0, 0))).toBe(0)
    expect(timeline.every(segment => segment.ratePerSecond >= 0)).toBe(true)
  })

  it('uses the existing fixed attendance override as a constant amount', () => {
    const start = new Date(2026, 7, 29, 10)
    const end = new Date(2026, 7, 29, 11)
    const attendanceRecords: AttendanceRecord[] = [{
      date: '2026-08-29',
      status: 'normal',
      payMode: 'fixed',
      fixedAmount: 88,
      updatedAt: start.toISOString(),
    }]
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [],
      attendanceRecords,
      rates: calculateRates(profile),
      startAt: start.getTime(),
      endAt: end.getTime(),
    })

    expect(timeline).toEqual([{
      startAt: start.getTime(),
      endAt: end.getTime(),
      baseAmount: 88,
      ratePerSecond: 0,
    }])
  })

  it('uses the fixed overnight shift start date and its manual attendance override', () => {
    const overnightProfile = {
      ...profile,
      workStartTime: '22:00',
      workEndTime: '06:00',
      paidBreak: true,
      defaultWorkMode: 'scheduled' as const,
    }
    const start = new Date(2026, 0, 1, 1, 30)
    const end = new Date(2026, 0, 1, 2, 30)
    const attendanceRecords: AttendanceRecord[] = [{
      date: '2025-12-31',
      status: 'normal',
      payMode: 'fixed',
      fixedAmount: 88,
      updatedAt: start.toISOString(),
    }, {
      date: '2026-01-01',
      status: 'leave',
      leaveType: 'personal',
      payMode: 'unpaid',
      updatedAt: start.toISOString(),
    }]
    const timeline = buildWorkTimeline({
      profile: overnightProfile,
      workRecords: [],
      attendanceRecords,
      rates: calculateRates(overnightProfile),
      startAt: start.getTime(),
      endAt: end.getTime(),
    })

    expect(timeline).toEqual([{
      startAt: start.getTime(),
      endAt: end.getTime(),
      baseAmount: 88,
      ratePerSecond: 0,
    }])
  })

  it('does not let a next-day official holiday interrupt the previous fixed overnight shift', () => {
    const overnightProfile = {
      ...profile,
      workStartTime: '22:00',
      workEndTime: '06:00',
      paidBreak: true,
      defaultWorkMode: 'scheduled' as const,
    }
    const timeline = buildWorkTimeline({
      profile: overnightProfile,
      workRecords: [],
      attendanceRecords: [],
      rates: calculateRates(overnightProfile),
      startAt: new Date(2026, 0, 1, 1, 30).getTime(),
      endAt: new Date(2026, 0, 1, 2, 30).getTime(),
    })

    expect(amountAt(timeline, new Date(2026, 0, 1, 2))).toBeCloseTo(144)
    expect(segmentAt(timeline, new Date(2026, 0, 1, 2))?.ratePerSecond).toBeCloseTo(0.01)
  })

  it('keeps the fixed overnight widget on its business-date living-cost rate', () => {
    const overnightProfile = {
      ...profile,
      salary: 100,
      workStartTime: '22:00',
      workEndTime: '06:00',
      paidBreak: true,
      includeLivingCost: true,
      livingCostMode: 'daily-ledger' as const,
      monthlyLivingCost: 1100,
      livingCostHistory: [
        { version: 1 as const, effectiveFrom: '2025-12-31', mode: 'deduct' as const, monthlyAmount: 1100 },
        { version: 1 as const, effectiveFrom: '2026-01-01', mode: 'daily-ledger' as const, monthlyAmount: 1100 },
      ],
    }
    const currentRates = calculateRates(overnightProfile)
    const previousRates = calculateRates(salaryProfileForBusinessDate(overnightProfile, '2025-12-31'))
    const timeline = buildWorkTimeline({
      profile: overnightProfile,
      workRecords: [],
      attendanceRecords: [],
      rates: currentRates,
      startAt: new Date(2026, 0, 1, 1, 59, 30).getTime(),
      endAt: new Date(2026, 0, 1, 2, 0, 30).getTime(),
    })

    expect(segmentAt(timeline, new Date(2026, 0, 1, 2))?.ratePerSecond).toBeCloseTo(previousRates.second)
    expect(amountAt(timeline, new Date(2026, 0, 1, 2))).toBeCloseTo(4 * 3600 * previousRates.second)
  })

  it('recognizes an official adjusted workday when that overnight shift starts', () => {
    const overnightProfile = {
      ...profile,
      workStartTime: '22:00',
      workEndTime: '06:00',
      paidBreak: true,
      defaultWorkMode: 'scheduled' as const,
    }
    const timeline = buildWorkTimeline({
      profile: overnightProfile,
      workRecords: [],
      attendanceRecords: [],
      rates: calculateRates(overnightProfile),
      startAt: new Date(2026, 0, 4, 22, 30).getTime(),
      endAt: new Date(2026, 0, 4, 23, 30).getTime(),
    })

    expect(amountAt(timeline, new Date(2026, 0, 4, 23))).toBeCloseTo(36)
    expect(segmentAt(timeline, new Date(2026, 0, 4, 23))?.ratePerSecond).toBeCloseTo(0.01)
  })

  it('stops an active flexible salary at the exact paid-time cap second', () => {
    const rates = calculateRates(profile)
    const activeStart = new Date(2026, 7, 28, 10, 0, 13)
    const paidTimeCap = new Date(2026, 7, 28, 10, 0, 40)
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'working',
      sessions: [{
        id: 'completed',
        startTime: new Date(2026, 7, 28, 0, 0, 0).toISOString(),
        endTime: new Date(2026, 7, 28, 7, 59, 33).toISOString(),
      }, {
        id: 'active',
        startTime: activeStart.toISOString(),
      }],
      updatedAt: activeStart.toISOString(),
    }
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [record],
      attendanceRecords: [],
      rates,
      startAt: new Date(2026, 7, 28, 10, 0, 20).getTime(),
      endAt: new Date(2026, 7, 28, 10, 1, 0).getTime(),
    })

    expect(amountAt(timeline, new Date(2026, 7, 28, 10, 0, 39))).toBeCloseTo(rates.daily - rates.second)
    expect(segmentAt(timeline, paidTimeCap)?.ratePerSecond).toBe(0)
    expect(amountAt(timeline, new Date(2026, 7, 28, 10, 0, 45))).toBeCloseTo(rates.daily)
  })

  it('stops an active flexible salary at a non-minute planned end', () => {
    const rates = calculateRates(profile)
    const activeStart = new Date(2026, 7, 28, 10, 0, 13)
    const plannedEnd = new Date(2026, 7, 28, 10, 0, 37)
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'working',
      sessions: [{ id: 'active', startTime: activeStart.toISOString() }],
      plannedEndTime: plannedEnd.toISOString(),
      updatedAt: activeStart.toISOString(),
    }
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [record],
      attendanceRecords: [],
      rates,
      startAt: new Date(2026, 7, 28, 10, 0, 20).getTime(),
      endAt: new Date(2026, 7, 28, 10, 1, 0).getTime(),
    })

    expect(segmentAt(timeline, new Date(2026, 7, 28, 10, 0, 36))?.ratePerSecond).toBeCloseTo(rates.second)
    expect(segmentAt(timeline, plannedEnd)?.ratePerSecond).toBe(0)
    expect(amountAt(timeline, new Date(2026, 7, 28, 10, 0, 50))).toBeCloseTo(24 * rates.second)
  })

  it('keeps an overnight planned shift in the next-day widget timeline', () => {
    const rates = calculateRates(profile)
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'working',
      sessions: [{ id: 'overnight', startTime: new Date(2026, 7, 28, 23).toISOString() }],
      plannedEndTime: new Date(2026, 7, 29, 1, 0, 17).toISOString(),
      updatedAt: new Date(2026, 7, 28, 23).toISOString(),
    }
    const timeline = buildWorkTimeline({
      profile,
      workRecords: [record],
      attendanceRecords: [],
      rates,
      startAt: new Date(2026, 7, 29, 0, 30).getTime(),
      endAt: new Date(2026, 7, 29, 1, 30).getTime(),
    })

    expect(segmentAt(timeline, new Date(2026, 7, 29, 0, 59, 59))?.ratePerSecond).toBeCloseTo(rates.second)
    expect(segmentAt(timeline, new Date(2026, 7, 29, 1, 0, 17))?.ratePerSecond).toBe(0)
  })

  it('keeps a carried paused shift as a constant next-day widget amount', () => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'paused',
      sessions: [{
        id: 'paused',
        startTime: new Date(2026, 7, 28, 23).toISOString(),
        endTime: new Date(2026, 7, 28, 23, 30).toISOString(),
      }],
      updatedAt: new Date(2026, 7, 28, 23, 30).toISOString(),
    }
    const timeline = nextDayTimeline(record)
    const at = new Date(2026, 7, 29, 0, 45)
    expect(segmentAt(timeline, at)?.ratePerSecond).toBe(0)
    expect(amountAt(timeline, at)).toBeCloseTo(1800 * calculateRates(profile).second)
  })

  it('keeps a carried pending settlement as a constant next-day widget amount', () => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'ended',
      settlementPending: true,
      sessions: [{
        id: 'pending',
        startTime: new Date(2026, 7, 28, 23).toISOString(),
        endTime: new Date(2026, 7, 28, 23, 45).toISOString(),
      }],
      updatedAt: new Date(2026, 7, 28, 23, 45).toISOString(),
    }
    const timeline = nextDayTimeline(record)
    expect(amountAt(timeline, new Date(2026, 7, 29, 0, 45))).toBeCloseTo(2700 * calculateRates(profile).second)
  })

  it('keeps a passed planned end as a constant next-day widget amount before Web settlement resumes', () => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'working',
      sessions: [{ id: 'planned', startTime: new Date(2026, 7, 28, 23).toISOString() }],
      plannedEndTime: new Date(2026, 7, 29, 0, 15).toISOString(),
      updatedAt: new Date(2026, 7, 28, 23).toISOString(),
    }
    const timeline = nextDayTimeline(record)
    const at = new Date(2026, 7, 29, 0, 45)
    expect(segmentAt(timeline, at)?.ratePerSecond).toBe(0)
    expect(amountAt(timeline, at)).toBeCloseTo(4500 * calculateRates(profile).second)
  })

  it.each([
    [{ payMode: 'fixed' as const, fixedAmount: 88 }, 88],
    [{ payMode: 'multiplier' as const, multiplier: 2 }, calculateRates(profile).daily * 2],
  ])('keeps the carried business-date attendance override in the next-day widget', (pay, expectedAmount) => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'ended',
      settlementPending: true,
      sessions: [{
        id: 'attendance-override',
        startTime: new Date(2026, 7, 28, 23).toISOString(),
        endTime: new Date(2026, 7, 28, 23, 30).toISOString(),
      }],
      updatedAt: new Date(2026, 7, 28, 23, 30).toISOString(),
    }
    const attendance: AttendanceRecord = {
      date: record.date,
      status: 'normal',
      ...pay,
      updatedAt: record.updatedAt,
    }
    const timeline = nextDayTimeline(record, [attendance])
    expect(amountAt(timeline, new Date(2026, 7, 29, 0, 45))).toBeCloseTo(expectedAmount)
  })
})

describe('widget snapshot', () => {
  it('serializes active timers using epoch milliseconds and a 36-hour-valid contract', () => {
    const now = new Date(2026, 7, 28, 10)
    const slackingStart = new Date(2026, 7, 28, 9, 30)
    const overtimeStart = new Date(2026, 7, 28, 9)
    const snapshot = buildWidgetSnapshot({
      profile,
      workRecords: [],
      attendanceRecords: [],
      activeSlacking: slackingStart.toISOString(),
      activeOvertime: {
        startTime: overtimeStart.toISOString(),
        payMode: 'multiplier',
        multiplier: 1.5,
      },
      now,
      horizonMs: 60_000,
    })

    expect(snapshot.version).toBe(1)
    expect(snapshot.syncedAt).toBe(now.getTime())
    expect(snapshot.validUntil).toBe(now.getTime() + 60_000)
    expect(snapshot.secondRate).toBeCloseTo(0.01)
    expect(snapshot.slacking).toEqual({ active: true, startAt: slackingStart.getTime(), ...captureSessionStartBusinessDate(slackingStart.toISOString()) })
    expect(snapshot.overtime).toEqual({
      active: true,
      startAt: overtimeStart.getTime(),
      ...captureSessionStartBusinessDate(overtimeStart.toISOString()),
      payMode: 'multiplier',
      multiplier: 1.5,
    })
  })

  it('omits invalid active timestamps', () => {
    const snapshot = buildWidgetSnapshot({
      profile,
      workRecords: [],
      attendanceRecords: [],
      activeSlacking: 'not-a-date',
      activeOvertime: { startTime: 'not-a-date', payMode: 'unpaid' },
      now: new Date(2026, 7, 28, 10),
      horizonMs: 1000,
    })

    expect(snapshot.slacking).toBeUndefined()
    expect(snapshot.overtime).toBeUndefined()
  })

  it('preserves active timer start-zone metadata in the native snapshot after travel', () => {
    vi.stubEnv('TZ', 'Etc/GMT+12')
    const startTime = '2026-08-31T09:30:00.000Z'
    const businessDate = { startLocalDate: '2026-08-31', startTimezoneOffsetMinutes: -840 }
    const snapshot = buildWidgetSnapshot({
      profile,
      workRecords: [],
      attendanceRecords: [],
      activeSlacking: { startTime, ...businessDate },
      activeOvertime: { startTime, ...businessDate, payMode: 'unpaid' },
      now: new Date('2026-08-31T10:00:00.000Z'),
      horizonMs: 1000,
    })

    expect(snapshot.slacking).toMatchObject(businessDate)
    expect(snapshot.overtime).toMatchObject(businessDate)
  })
})
