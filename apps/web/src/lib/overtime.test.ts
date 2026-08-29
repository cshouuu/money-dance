import { describe, expect, it } from 'vitest'
import type { LedgerEntry, OvertimeSession } from '../types'
import { createOvertimeLedgerEntries, migrateLegacyOvertimeLedgerDates, splitOvertimeSessionByLocalDay } from './overtime'

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

    expect(migrateLegacyOvertimeLedgerDates([legacy], [overtime])[0]?.occurredAt).toBe(start.toISOString())
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
  })
})
