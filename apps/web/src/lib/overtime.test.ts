import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LedgerEntry, OvertimeSession } from '../types'
import {
  createCompletedOvertimeSession,
  createOvertimeLedgerEntries,
  hasOverlappingOvertime,
  migrateLegacyOvertimeLedgerDates,
  migrateLegacyOvertimeSessionLocalDates,
  splitOvertimeSessionByLocalDay,
} from './overtime'

afterEach(() => {
  vi.unstubAllEnvs()
})

function session(start: Date, end: Date): Pick<OvertimeSession, 'startTime' | 'endTime'> {
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  }
}

describe('cross-day overtime attribution', () => {
  it('splits duration at the user local midnight', () => {
    const shares = splitOvertimeSessionByLocalDay(session(
      new Date(2026, 7, 31, 23, 30),
      new Date(2026, 8, 1, 1, 30),
    ))

    expect(shares.map(share => share.date)).toEqual(['2026-08-31', '2026-09-01'])
    expect(shares.map(share => share.durationSeconds)).toEqual([1800, 5400])
  })

  it('keeps both local-day time slices for a cross-day session', () => {
    const shares = splitOvertimeSessionByLocalDay(session(
      new Date(2026, 7, 31, 23),
      new Date(2026, 8, 1, 1),
    ))

    expect(shares).toHaveLength(2)
    expect(shares.reduce((sum, share) => sum + share.durationSeconds, 0)).toBe(7200)
  })

  it('splits flexible-work segments without counting a cross-midnight pause', () => {
    const firstStart = new Date(2026, 7, 31, 23, 30)
    const firstEnd = new Date(2026, 7, 31, 23, 45)
    const secondStart = new Date(2026, 8, 1, 0, 30)
    const secondEnd = new Date(2026, 8, 1, 1)
    const shares = splitOvertimeSessionByLocalDay({
      startTime: firstStart.toISOString(),
      endTime: secondEnd.toISOString(),
      segments: [
        { startTime: firstStart.toISOString(), endTime: firstEnd.toISOString() },
        { startTime: secondStart.toISOString(), endTime: secondEnd.toISOString() },
      ],
    })

    expect(shares.map(share => share.date)).toEqual(['2026-08-31', '2026-09-01'])
    expect(shares.map(share => share.durationSeconds)).toEqual([900, 1800])
  })

  it('keeps a zero-duration session on the local start date', () => {
    const start = new Date(2026, 7, 31, 23, 59)
    const shares = splitOvertimeSessionByLocalDay(session(start, start))

    expect(shares).toEqual([{
      date: '2026-08-31',
      startTime: start.toISOString(),
      endTime: start.toISOString(),
      durationSeconds: 0,
    }])
  })

  it('records the full income once on the local start date', () => {
    const start = new Date(2026, 7, 31, 23, 30)
    const end = new Date(2026, 8, 1, 1, 30)
    const entries = createOvertimeLedgerEntries({
      id: 'overtime-1',
      payMode: 'fixed',
      fixedAmount: 40,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationSeconds: 7200,
      earnedAmount: 40,
    }, (() => {
      let index = 0
      return () => `ledger-${index += 1}`
    })())

    expect(entries).toHaveLength(1)
    expect(entries[0]?.amount).toBe(40)
    expect(entries[0]?.linkedId).toBe('overtime-1')
    expect(entries[0]?.source).toBe('加班收入 · 固定 ¥40.00')
    expect(entries[0]?.occurredAt).toBe(start.toISOString())
  })

  it('migrates an untouched legacy ledger entry from end time to start time', () => {
    const start = new Date(2026, 7, 31, 23, 30)
    const end = new Date(2026, 8, 1, 1, 30)
    const overtime: OvertimeSession = {
      id: 'overtime-1',
      payMode: 'fixed',
      fixedAmount: 40,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationSeconds: 7200,
      earnedAmount: 40,
    }
    const legacy: LedgerEntry = {
      id: 'ledger-1',
      kind: 'overtime',
      direction: 'income',
      amount: 40,
      source: '加班收入 · 固定 ¥40.00',
      occurredAt: end.toISOString(),
      linkedId: overtime.id,
    }

    const migrated = migrateLegacyOvertimeLedgerDates([legacy], [overtime])[0]
    expect(migrated?.occurredAt).toBe(start.toISOString())
    expect(migrated?.localDate).toBe('2026-08-31')
  })

  it('preserves a historical ledger entry after the user edits its date', () => {
    const start = new Date(2026, 7, 31, 23, 30)
    const end = new Date(2026, 8, 1, 1, 30)
    const editedDate = new Date(2026, 7, 30, 12).toISOString()
    const overtime: OvertimeSession = {
      id: 'overtime-1',
      payMode: 'fixed',
      fixedAmount: 40,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationSeconds: 7200,
      earnedAmount: 40,
    }
    const edited: LedgerEntry = {
      id: 'ledger-1',
      kind: 'overtime',
      direction: 'income',
      amount: 40,
      source: '加班收入 · 固定 ¥40.00',
      occurredAt: editedDate,
      linkedId: overtime.id,
    }

    const entries = [edited]
    const migrated = migrateLegacyOvertimeLedgerDates(entries, [overtime])
    expect(migrated).toBe(entries)
    expect(migrated[0]?.occurredAt).toBe(editedDate)
    expect(migrated[0]?.localDate).toBeUndefined()
  })

  it('recovers a legacy session date from an untouched linked ledger', () => {
    vi.stubEnv('TZ', 'Etc/GMT+12')
    const overtime: OvertimeSession = {
      id: 'legacy-session',
      payMode: 'fixed',
      fixedAmount: 40,
      startTime: '2026-08-31T09:30:00.000Z',
      endTime: '2026-08-31T10:30:00.000Z',
      durationSeconds: 3600,
      earnedAmount: 40,
    }
    const linked: LedgerEntry = {
      id: 'legacy-ledger',
      kind: 'overtime',
      direction: 'income',
      amount: 40,
      source: '加班收入 · 固定 ¥40.00',
      occurredAt: overtime.startTime,
      localDate: '2026-08-31',
      linkedId: overtime.id,
    }

    const migrated = migrateLegacyOvertimeSessionLocalDates([overtime], [linked])[0]
    expect(migrated?.startLocalDate).toBe('2026-08-31')
    // The linked date is reliable, but its former timezone boundary is not.
    expect(migrated?.startTimezoneOffsetMinutes).toBeUndefined()
  })

  it('does not treat a user-moved ledger date as the legacy session start date', () => {
    vi.stubEnv('TZ', 'Etc/GMT+12')
    const overtime: OvertimeSession = {
      id: 'manually-moved-session',
      payMode: 'fixed',
      fixedAmount: 40,
      startTime: '2026-08-31T09:30:00.000Z',
      endTime: '2026-08-31T10:30:00.000Z',
      durationSeconds: 3600,
      earnedAmount: 40,
    }
    const manuallyMoved: LedgerEntry = {
      id: 'manually-moved-ledger',
      kind: 'overtime',
      direction: 'income',
      amount: 40,
      source: '加班收入 · 固定 ¥40.00',
      occurredAt: '2026-08-29T12:00:00.000Z',
      localDate: '2026-08-29',
      linkedId: overtime.id,
    }

    const migrated = migrateLegacyOvertimeSessionLocalDates([overtime], [manuallyMoved])[0]
    expect(migrated?.startLocalDate).toBe('2026-08-30')
    expect(migrated?.startLocalDate).not.toBe(manuallyMoved.localDate)
  })
})

describe('completed overtime creation and overlap checks', () => {
  it('creates a continuous multiplier session with calculated earnings', () => {
    const result = createCompletedOvertimeSession({
      id: 'backfill-1',
      startTime: '2026-08-30T10:00:00.000Z',
      endTime: '2026-08-30T11:00:00.000Z',
      payMode: 'multiplier',
      multiplier: 2,
    }, 0.01)

    expect(result?.durationSeconds).toBe(3600)
    expect(result?.earnedAmount).toBe(72)
    expect(result?.segments).toBeUndefined()
  })

  it('uses actual work segments and excludes pauses from duration and earnings', () => {
    const result = createCompletedOvertimeSession({
      id: 'flex-excess-1',
      startTime: '2026-08-30T10:00:00.000Z',
      endTime: '2026-08-30T12:00:00.000Z',
      payMode: 'multiplier',
      multiplier: 1,
      segments: [
        { startTime: '2026-08-30T10:00:00.000Z', endTime: '2026-08-30T10:30:00.000Z' },
        { startTime: '2026-08-30T11:30:00.000Z', endTime: '2026-08-30T12:00:00.000Z' },
      ],
    }, 0.01)

    expect(result?.durationSeconds).toBe(3600)
    expect(result?.earnedAmount).toBe(36)
    expect(result?.segments).toHaveLength(2)
  })

  it('rejects invalid, overlapping or out-of-range segments', () => {
    expect(createCompletedOvertimeSession({
      id: 'invalid',
      startTime: '2026-08-30T10:00:00.000Z',
      endTime: '2026-08-30T12:00:00.000Z',
      payMode: 'unpaid',
      segments: [
        { startTime: '2026-08-30T10:00:00.000Z', endTime: '2026-08-30T11:30:00.000Z' },
        { startTime: '2026-08-30T11:00:00.000Z', endTime: '2026-08-30T12:00:00.000Z' },
      ],
    }, 0.01)).toBeNull()
  })

  it('detects overlap while allowing adjacent records', () => {
    const sessions = [{ startTime: '2026-08-30T10:00:00.000Z', endTime: '2026-08-30T11:00:00.000Z' }]
    expect(hasOverlappingOvertime(sessions, '2026-08-30T10:30:00.000Z', '2026-08-30T12:00:00.000Z')).toBe(true)
    expect(hasOverlappingOvertime(sessions, '2026-08-30T11:00:00.000Z', '2026-08-30T12:00:00.000Z')).toBe(false)
  })
})
