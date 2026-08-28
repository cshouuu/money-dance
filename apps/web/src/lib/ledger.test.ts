import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, LedgerEntry } from '../types'
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
})
