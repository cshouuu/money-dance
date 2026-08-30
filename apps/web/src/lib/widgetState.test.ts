import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { buildWidgetSnapshot, buildWorkTimeline, type WidgetTimelineSegment } from './widgetState'

const profile = {
  ...DEFAULT_PROFILE,
  salary: 288,
  salaryType: 'daily' as const,
  workDaysPerWeek: 5,
}

function segmentAt(timeline: WidgetTimelineSegment[], date: Date) {
  const time = date.getTime()
  return timeline.find(segment => segment.startAt <= time && time < segment.endAt)
}

function amountAt(timeline: WidgetTimelineSegment[], date: Date): number | null {
  const segment = segmentAt(timeline, date)
  if (!segment) return null
  return segment.baseAmount + ((date.getTime() - segment.startAt) / 1000) * segment.ratePerSecond
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
    expect(snapshot.slacking).toEqual({ active: true, startAt: slackingStart.getTime() })
    expect(snapshot.overtime).toEqual({
      active: true,
      startAt: overtimeStart.getTime(),
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
})
