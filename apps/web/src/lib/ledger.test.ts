import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import { summarizeLedger } from './ledger'

const profile = {
  ...DEFAULT_PROFILE,
  salary: 100,
  salaryType: 'daily' as const,
  salaryEffectiveDate: '2026-08-01',
}
const start = new Date(2026, 7, 27)
const end = new Date(2026, 7, 28)
const now = new Date(2026, 7, 28, 20)

function attendance(record: Partial<AttendanceRecord>): AttendanceRecord[] {
  return [{ date: '2026-08-27', status: 'leave', leaveType: 'sick', payMode: 'unpaid', updatedAt: now.toISOString(), ...record }]
}

function historicalFlexibleRecord(settlementMode?: NonNullable<DailyWorkRecord['settlementMode']>, hours = 1): DailyWorkRecord {
  const startedAt = new Date(2026, 7, 27, 9)
  const endedAt = new Date(2026, 7, 27, 9 + hours)
  return {
    date: '2026-08-27',
    mode: 'flexible',
    status: 'ended',
    sessions: [{ id: 'work-1', startTime: startedAt.toISOString(), endTime: endedAt.toISOString() }],
    updatedAt: endedAt.toISOString(),
    ...(settlementMode ? { settlementMode } : {}),
  }
}

describe('attendance salary recalculation', () => {
  it('removes salary income for unpaid leave', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], attendance({ payMode: 'unpaid' }))
    expect(summary.income).toBe(0)
    expect(summary.entries).toHaveLength(0)
  })

  it('uses the entered salary multiplier for paid leave', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], attendance({ payMode: 'multiplier', multiplier: 0.8 }))
    expect(summary.income).toBeCloseTo(calculateRates(profile).daily * 0.8)
    expect(summary.entries[0]?.source).toBe('工资收入 · 病假')
  })

  it('uses a fixed daily amount and takes priority over an old salary override', () => {
    const ledger: LedgerEntry[] = [{
      id: 'old-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 999,
      source: '旧工资调整',
      occurredAt: new Date(2026, 7, 27, 12).toISOString(),
      replacesId: 'salary-2026-8-27',
    }]
    const summary = summarizeLedger(profile, ledger, start, end, now, [], attendance({ payMode: 'fixed', fixedAmount: 88 }))
    expect(summary.income).toBe(88)
    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0]?.source).toBe('工资收入 · 病假')
  })

  it('restores an old salary override after the attendance adjustment is removed', () => {
    const ledger: LedgerEntry[] = [{
      id: 'old-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 999,
      source: '旧工资调整',
      occurredAt: new Date(2026, 7, 27, 12).toISOString(),
      replacesId: 'salary-2026-8-27',
    }]
    const summary = summarizeLedger(profile, ledger, start, end, now, [], [])
    expect(summary.income).toBe(999)
    expect(summary.entries[0]?.source).toBe('旧工资调整')
  })

  it('starts generated salary entries on the selected historical date', () => {
    const customStartProfile = { ...profile, salaryHistoryMode: 'custom' as const, salaryEffectiveDate: '2026-08-27' }
    const summary = summarizeLedger(customStartProfile, [], new Date(2026, 7, 26), new Date(2026, 7, 28), now, [], [])
    expect(summary.income).toBe(100)
    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0]?.id).toBe('salary-2026-8-27')
  })

  it('removes salary income for an unpaid holiday', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], attendance({ status: 'holiday', leaveType: undefined, payMode: 'unpaid' }))
    expect(summary.income).toBe(0)
    expect(summary.entries).toHaveLength(0)
  })

  it('uses the selected multiplier and label for a paid holiday', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], attendance({ status: 'holiday', leaveType: undefined, payMode: 'multiplier', multiplier: 1.2 }))
    expect(summary.income).toBeCloseTo(120)
    expect(summary.entries[0]?.source).toBe('工资收入 · 带薪假')
  })

  it('uses a fixed amount for a paid holiday', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], attendance({ status: 'holiday', leaveType: undefined, payMode: 'fixed', fixedAmount: 66 }))
    expect(summary.income).toBe(66)
    expect(summary.entries[0]?.source).toBe('工资收入 · 带薪假')
  })
})

describe('manual attendance before the salary history start date', () => {
  const currentOnlyProfile = {
    ...profile,
    salaryHistoryMode: 'none' as const,
    salaryEffectiveDate: '2026-08-28',
  }

  it('does not automatically generate salary before the effective date', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], [])
    expect(summary.income).toBe(0)
    expect(summary.entries).toHaveLength(0)
  })

  it('uses a fixed amount from an explicit historical attendance adjustment', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], attendance({ status: 'holiday', leaveType: undefined, payMode: 'fixed', fixedAmount: 66 }))
    expect(summary.income).toBe(66)
    expect(summary.entries[0]?.source).toBe('工资收入 · 带薪假')
  })

  it('uses a multiplier from an explicit historical attendance adjustment', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], attendance({ payMode: 'multiplier', multiplier: 0.5 }))
    expect(summary.income).toBeCloseTo(50)
    expect(summary.entries[0]?.source).toBe('工资收入 · 病假')
  })

  it('uses normal daily salary when the historical day is explicitly marked as normal', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], attendance({ status: 'normal', leaveType: undefined, payMode: undefined }))
    expect(summary.income).toBe(100)
    expect(summary.entries[0]?.source).toBe('工资收入')
  })

  it('keeps an explicit unpaid historical adjustment at zero', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], attendance({ status: 'holiday', leaveType: undefined, payMode: 'unpaid' }))
    expect(summary.income).toBe(0)
    expect(summary.entries).toHaveLength(0)
  })
})

describe('historical flexible salary settlement', () => {
  it('keeps an actual-time early finish in ledger history', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('actual')], [])
    expect(summary.income).toBeCloseTo(12.5)
    expect(summary.entries[0]?.id).toBe('salary-2026-8-27')
  })

  it('keeps a full-day early finish in ledger history', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('full-day')], [])
    expect(summary.income).toBeCloseTo(100)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤')
  })

  it('treats legacy records without a settlement mode as actual time', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord()], [])
    expect(summary.income).toBeCloseTo(12.5)
  })

  it('uses actual hourly pay even if a stale record says full day', () => {
    const hourly = { ...profile, salary: 50, salaryType: 'hourly' as const }
    const summary = summarizeLedger(hourly, [], start, end, now, [historicalFlexibleRecord('full-day')], [])
    expect(summary.income).toBeCloseTo(50)
    expect(summary.income).not.toBeCloseTo(calculateRates(hourly).daily)
  })

  it('caps historical actual-time settlement at one paid day', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('actual', 12)], [])
    expect(summary.income).toBeCloseTo(100)
  })

  it('lets unpaid attendance override a saved full-day settlement', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('full-day')], attendance({ payMode: 'unpaid' }))
    expect(summary.income).toBe(0)
  })

  it('lets a manual salary override replace a saved full-day settlement', () => {
    const ledger: LedgerEntry[] = [{
      id: 'manual-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 76,
      source: '手工工资调整',
      occurredAt: new Date(2026, 7, 27, 12).toISOString(),
      replacesId: 'salary-2026-8-27',
    }]
    const summary = summarizeLedger(profile, ledger, start, end, now, [historicalFlexibleRecord('full-day')], [])
    expect(summary.income).toBe(76)
    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0]?.source).toBe('手工工资调整')
  })
})

describe('alternating workweek salary entries', () => {
  const alternatingProfile = {
    ...profile,
    workWeekMode: 'alternating' as const,
    alternatingAnchorDate: '2026-08-24',
    alternatingAnchorType: 'big' as const,
  }

  it('adds salary for a big-week Saturday', () => {
    const saturday = new Date(2026, 7, 29)
    const summary = summarizeLedger(alternatingProfile, [], saturday, new Date(2026, 7, 30), new Date(2026, 8, 6), [], [])
    expect(summary.income).toBe(100)
    expect(summary.entries[0]?.id).toBe('salary-2026-8-29')
  })

  it('does not add salary for the following small-week Saturday', () => {
    const saturday = new Date(2026, 8, 5)
    const summary = summarizeLedger(alternatingProfile, [], saturday, new Date(2026, 8, 6), new Date(2026, 8, 6), [], [])
    expect(summary.income).toBe(0)
    expect(summary.entries).toHaveLength(0)
  })

  it('lets a manual attendance adjustment override a small-week Saturday', () => {
    const saturday = new Date(2026, 8, 5)
    const attendanceRecords: AttendanceRecord[] = [{ date: '2026-09-05', status: 'normal', updatedAt: new Date(2026, 8, 5, 12).toISOString() }]
    const summary = summarizeLedger(alternatingProfile, [], saturday, new Date(2026, 8, 6), new Date(2026, 8, 6), [], attendanceRecords)
    expect(summary.income).toBe(100)
  })
})
