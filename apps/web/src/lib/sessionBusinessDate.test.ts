import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompletedOvertimeSession, splitOvertimeSessionByLocalDay } from './overtime'
import { createCompletedSlackingSession } from './slacking'
import { sessionStartLocalDate } from './sessionBusinessDate'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('timer session business dates', () => {
  it.each([
    {
      startZone: 'Pacific/Kiritimati',
      destinationZone: 'Etc/GMT+12',
      startTime: '2026-08-31T09:30:00.000Z',
      endTime: '2026-08-31T10:30:00.000Z',
      localDate: '2026-08-31',
      offset: -840,
    },
    {
      startZone: 'Etc/GMT+12',
      destinationZone: 'Pacific/Kiritimati',
      startTime: '2026-09-01T12:30:00.000Z',
      endTime: '2026-09-01T13:30:00.000Z',
      localDate: '2026-09-01',
      offset: 720,
    },
  ])('keeps overtime and slacking on their $startZone start date after moving zones', ({
    startZone,
    destinationZone,
    startTime,
    endTime,
    localDate,
    offset,
  }) => {
    vi.stubEnv('TZ', startZone)
    const overtime = createCompletedOvertimeSession({
      id: `overtime-${offset}`,
      startTime,
      endTime,
      payMode: 'fixed',
      fixedAmount: 10,
    }, 0.01)
    const slacking = createCompletedSlackingSession({
      id: `slacking-${offset}`,
      startTime,
      endTime,
    }, 0.01)

    expect(overtime).toMatchObject({ startLocalDate: localDate, startTimezoneOffsetMinutes: offset })
    expect(slacking).toMatchObject({ startLocalDate: localDate, startTimezoneOffsetMinutes: offset })

    vi.stubEnv('TZ', destinationZone)
    expect(sessionStartLocalDate(overtime!)).toBe(localDate)
    expect(sessionStartLocalDate(slacking!)).toBe(localDate)
  })

  it('keeps original +14 midnight slices after the device moves to -12', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const session = createCompletedOvertimeSession({
      id: 'cross-zone-midnight',
      startTime: '2026-08-31T09:30:00.000Z', // 23:30 at UTC+14
      endTime: '2026-08-31T11:30:00.000Z', // 01:30 next day at UTC+14
      payMode: 'fixed',
      fixedAmount: 20,
    }, 0.01)
    expect(session).not.toBeNull()

    vi.stubEnv('TZ', 'Etc/GMT+12')
    const slices = splitOvertimeSessionByLocalDay(session!)
    expect(slices.map(slice => slice.date)).toEqual(['2026-08-31', '2026-09-01'])
    expect(slices.map(slice => slice.durationSeconds)).toEqual([1800, 5400])
  })

  it('keeps segmented overtime on original-zone days without counting pauses', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const session = createCompletedOvertimeSession({
      id: 'cross-zone-segments',
      startTime: '2026-08-31T09:30:00.000Z',
      endTime: '2026-08-31T11:00:00.000Z',
      segments: [
        { startTime: '2026-08-31T09:30:00.000Z', endTime: '2026-08-31T09:45:00.000Z' },
        { startTime: '2026-08-31T10:30:00.000Z', endTime: '2026-08-31T11:00:00.000Z' },
      ],
      payMode: 'multiplier',
      multiplier: 1,
    }, 0.01)
    expect(session).not.toBeNull()

    vi.stubEnv('TZ', 'Etc/GMT+12')
    const slices = splitOvertimeSessionByLocalDay(session!)
    expect(slices.map(slice => slice.date)).toEqual(['2026-08-31', '2026-09-01'])
    expect(slices.map(slice => slice.durationSeconds)).toEqual([900, 1800])
  })
})
