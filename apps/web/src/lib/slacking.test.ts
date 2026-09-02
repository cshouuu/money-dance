import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompletedSlackingSession, hasOverlappingSlacking, migrateLegacySlackingSessionLocalDates, normalizeActiveSlacking, slackingPaidDurationSeconds } from './slacking'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('slacking backfill helpers', () => {
  it('creates a completed session from real timestamps', () => {
    const session = createCompletedSlackingSession({
      id: 'slacking-backfill-1',
      startTime: '2026-08-30T10:00:00.000Z',
      endTime: '2026-08-30T10:30:00.000Z',
    }, 0.01)

    expect(session?.durationSeconds).toBe(1800)
    expect(session?.paidDurationSeconds).toBe(1800)
    expect(session?.earnedAmount).toBe(18)
  })

  it('stores elapsed and paid duration separately', () => {
    const session = createCompletedSlackingSession({
      id: 'lunch',
      startTime: '2026-08-30T10:00:00.000Z',
      endTime: '2026-08-30T12:00:00.000Z',
    }, { paidDurationSeconds: 3600, earnedAmount: 12 })

    expect(session).toMatchObject({ durationSeconds: 7200, paidDurationSeconds: 3600, earnedAmount: 12 })
    expect(slackingPaidDurationSeconds(session!)).toBe(3600)
    expect(slackingPaidDurationSeconds({ durationSeconds: 600 })).toBe(600)
  })

  it('rejects reversed and invalid timestamps', () => {
    expect(createCompletedSlackingSession({
      id: 'reversed',
      startTime: '2026-08-30T11:00:00.000Z',
      endTime: '2026-08-30T10:00:00.000Z',
    }, 0.01)).toBeNull()
    expect(createCompletedSlackingSession({
      id: 'invalid',
      startTime: 'not-a-date',
      endTime: '2026-08-30T10:00:00.000Z',
    }, 0.01)).toBeNull()
  })

  it('detects overlap and permits adjacent sessions', () => {
    const sessions = [{ startTime: '2026-08-30T10:00:00.000Z', endTime: '2026-08-30T10:30:00.000Z' }]
    expect(hasOverlappingSlacking(sessions, '2026-08-30T10:29:00.000Z', '2026-08-30T11:00:00.000Z')).toBe(true)
    expect(hasOverlappingSlacking(sessions, '2026-08-30T10:30:00.000Z', '2026-08-30T11:00:00.000Z')).toBe(false)
  })

  it('migrates legacy sessions and active string timers with a best-effort zone snapshot', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const startTime = '2026-08-31T09:30:00.000Z'
    const legacy = {
      id: 'legacy-slacking',
      startTime,
      endTime: '2026-08-31T10:30:00.000Z',
      durationSeconds: 3600,
      earnedAmount: 10,
    }

    expect(migrateLegacySlackingSessionLocalDates([legacy])[0]).toMatchObject({
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
    })
    expect(normalizeActiveSlacking(startTime)).toEqual({
      startTime,
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
    })
  })
})
