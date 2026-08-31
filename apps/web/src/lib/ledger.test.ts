import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import { createCompletedOvertimeSession, createOvertimeLedgerEntries } from './overtime'
import { getSummaryRange, loadLedger, migrateLegacySalaryOverrideLocalDates, salaryOverrideLocalDate, summarizeLedger } from './ledger'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

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

function normalAttendance(record: Partial<AttendanceRecord> = {}, date = '2026-08-27'): AttendanceRecord[] {
  return [{ date, status: 'normal', updatedAt: now.toISOString(), ...record }]
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

describe('overtime business-date ranges', () => {
  it('keeps +14 start-day income in its original month after moving to -12', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const session = createCompletedOvertimeSession({
      id: 'month-zone-overtime',
      startTime: '2026-08-31T09:30:00.000Z',
      endTime: '2026-08-31T10:30:00.000Z',
      payMode: 'fixed',
      fixedAmount: 40,
    }, 0.01)
    expect(session).not.toBeNull()
    const ledger = createOvertimeLedgerEntries(session!, () => 'month-zone-ledger')
    expect(ledger[0]?.localDate).toBe('2026-08-31')

    vi.stubEnv('TZ', 'Etc/GMT+12')
    const noAutomaticSalary = { ...profile, salaryEffectiveDate: '2027-01-01' }
    const august = getSummaryRange('month', '2026-08')
    const september = getSummaryRange('month', '2026-09')
    expect(summarizeLedger(noAutomaticSalary, ledger, august.start, august.end, new Date('2026-12-31T12:00:00.000Z'), [], []).income).toBe(40)
    expect(summarizeLedger(noAutomaticSalary, ledger, september.start, september.end, new Date('2026-12-31T12:00:00.000Z'), [], []).income).toBe(0)
  })
})

describe('salary override business dates', () => {
  it('migrates a legacy salary override from its stable replacement id', () => {
    const legacy: LedgerEntry = {
      id: 'legacy-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 88,
      source: '工资调整',
      occurredAt: '2026-09-01T00:00:00.000Z',
      replacesId: 'salary-2026-8-31',
    }
    const untouched: LedgerEntry = {
      ...legacy,
      id: 'manual-entry',
      kind: 'manual',
      replacesId: undefined,
    }

    const entries = [legacy, untouched]
    const migrated = migrateLegacySalaryOverrideLocalDates(entries)
    expect(migrated).not.toBe(entries)
    expect(migrated[0]?.localDate).toBe('2026-08-31')
    expect(migrated[0]?.occurredAt).toBe(legacy.occurredAt)
    expect(migrated[1]).toBe(untouched)
  })

  it('persists the inferred local date while loading old ledger data', () => {
    const values = new Map<string, string>([[
      'salary-flow.ledger.v1',
      JSON.stringify([{
        id: 'legacy-override',
        kind: 'salary_override',
        direction: 'income',
        amount: 88,
        source: '工资调整',
        occurredAt: '2026-09-01T00:00:00.000Z',
        replacesId: 'salary-2026-8-31',
      }]),
    ]])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    })

    expect(loadLedger()[0]?.localDate).toBe('2026-08-31')
    expect(JSON.parse(values.get('salary-flow.ledger.v1') ?? '[]')[0]?.localDate).toBe('2026-08-31')
  })

  it('locks a salary-derived override to the date encoded by the salary id', () => {
    expect(salaryOverrideLocalDate({
      id: 'salary-2026-8-31',
      localDate: '2026-09-01',
      occurredAt: '2026-09-01T00:00:00.000Z',
    })).toBe('2026-08-31')
  })

  it.each([
    {
      zone: 'Pacific/Kiritimati',
      localDate: '2026-08-31',
      occurredAt: '2026-09-01T00:00:00.000Z',
      dayAnchor: '2026-08-31',
      monthAnchor: '2026-08',
      adjacentMonth: '2026-09',
      replacesId: 'salary-2026-8-31',
    },
    {
      zone: 'Etc/GMT+12',
      localDate: '2026-09-01',
      occurredAt: '2026-08-31T22:00:00.000Z',
      dayAnchor: '2026-09-01',
      monthAnchor: '2026-09',
      adjacentMonth: '2026-08',
      replacesId: 'salary-2026-9-1',
    },
  ])('keeps day, month and year ranges stable in $zone', ({ zone, localDate, occurredAt, dayAnchor, monthAnchor, adjacentMonth, replacesId }) => {
    vi.stubEnv('TZ', zone)
    const override: LedgerEntry = {
      id: 'zone-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 77,
      source: '跨时区工资调整',
      occurredAt,
      localDate,
      replacesId,
    }
    const noAutomaticHistory = { ...profile, salaryEffectiveDate: '2027-01-01' }
    const now = new Date(2026, 11, 31, 20)

    for (const [dimension, anchor] of [['day', dayAnchor], ['month', monthAnchor], ['year', '2026']] as const) {
      const range = getSummaryRange(dimension, anchor)
      const summary = summarizeLedger(noAutomaticHistory, [override], range.start, range.end, now, [], [])
      expect(summary.income).toBe(77)
      expect(summary.entries[0]?.localDate).toBe(localDate)
    }

    const adjacentRange = getSummaryRange('month', adjacentMonth)
    expect(summarizeLedger(noAutomaticHistory, [override], adjacentRange.start, adjacentRange.end, now, [], []).income).toBe(0)
  })

  it('replaces only its own business-date salary without hiding another day after a timezone move', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const augustProfile = { ...profile, salaryEffectiveDate: '2026-08-28' }
    const override: LedgerEntry = {
      id: 'august-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 77,
      source: '8月31日工资调整',
      occurredAt: '2026-09-01T00:00:00.000Z',
      localDate: '2026-08-31',
      replacesId: 'salary-2026-8-31',
    }
    const range = getSummaryRange('month', '2026-08')
    const summary = summarizeLedger(augustProfile, [override], range.start, range.end, new Date(2026, 8, 2, 20), [], [])

    expect(summary.income).toBe(177)
    expect(summary.entries.map(entry => entry.localDate)).toEqual(expect.arrayContaining(['2026-08-28', '2026-08-31']))
    expect(summary.entries.filter(entry => entry.id === 'salary-2026-8-31')).toHaveLength(1)
  })
})

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

  it('uses a multiplier for explicit normal attendance', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], normalAttendance({ payMode: 'multiplier', multiplier: 2 }))
    expect(summary.income).toBe(200)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤 · 2 倍计薪')
  })

  it('uses a fixed amount for explicit normal attendance', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [], normalAttendance({ payMode: 'fixed', fixedAmount: 88 }))
    expect(summary.income).toBe(88)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤 · 固定 ¥88.00')
  })

  it('uses the full custom amount on the current day instead of salary progress', () => {
    const todayStart = new Date(2026, 7, 28)
    const todayEnd = new Date(2026, 7, 29)
    const summary = summarizeLedger(profile, [], todayStart, todayEnd, now, [], normalAttendance({ payMode: 'multiplier', multiplier: 2 }, '2026-08-28'))
    expect(summary.income).toBe(200)
  })

  it('lets explicit normal attendance take priority over an old salary override', () => {
    const ledger: LedgerEntry[] = [{
      id: 'old-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 999,
      source: '旧工资调整',
      occurredAt: new Date(2026, 7, 27, 12).toISOString(),
      replacesId: 'salary-2026-8-27',
    }]
    const summary = summarizeLedger(profile, ledger, start, end, now, [], normalAttendance({ payMode: 'multiplier', multiplier: 2 }))
    expect(summary.income).toBe(200)
    expect(summary.entries).toHaveLength(1)
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

  it('uses a custom normal-attendance amount before the salary history start date', () => {
    const summary = summarizeLedger(currentOnlyProfile, [], start, end, now, [], normalAttendance({ payMode: 'fixed', fixedAmount: 76 }))
    expect(summary.income).toBe(76)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤 · 固定 ¥76.00')
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

  it('uses the configured target-day amount for a new hourly full-day choice', () => {
    const hourly = { ...profile, salary: 50, salaryType: 'hourly' as const }
    const record = { ...historicalFlexibleRecord('full-day'), settlementVersion: 2 as const }
    const summary = summarizeLedger(hourly, [], start, end, now, [record], [])
    expect(summary.income).toBeCloseTo(calculateRates(hourly).daily)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤')
  })

  it('caps historical actual-time settlement at one paid day', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('actual', 12)], [])
    expect(summary.income).toBeCloseTo(100)
  })

  it('lets unpaid attendance override a saved full-day settlement', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('full-day')], attendance({ payMode: 'unpaid' }))
    expect(summary.income).toBe(0)
  })

  it('lets a normal-attendance multiplier override an actual-time settlement', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('actual')], normalAttendance({ payMode: 'multiplier', multiplier: 2 }))
    expect(summary.income).toBe(200)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤 · 2 倍计薪')
  })

  it('lets a normal-attendance fixed amount override a full-day settlement', () => {
    const summary = summarizeLedger(profile, [], start, end, now, [historicalFlexibleRecord('full-day')], normalAttendance({ payMode: 'fixed', fixedAmount: 66 }))
    expect(summary.income).toBe(66)
    expect(summary.entries[0]?.source).toBe('工资收入 · 正常出勤 · 固定 ¥66.00')
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

describe('daily living cost ledger entries', () => {
  const dailyLivingCostProfile = {
    ...profile,
    includeLivingCost: true,
    monthlyLivingCost: 1000,
    livingCostMode: 'daily-ledger' as const,
    livingCostHistory: [{
      version: 1 as const,
      effectiveFrom: '2026-08-01',
      mode: 'daily-ledger' as const,
      monthlyAmount: 1000,
    }],
  }

  it('spreads a 31-day month by cents without losing or adding money', () => {
    const summary = summarizeLedger(
      dailyLivingCostProfile,
      [],
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 8, 1),
      [],
      [],
    )
    const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
    expect(expenses).toHaveLength(31)
    expect(Math.round(summary.expense * 100)).toBe(100_000)
    expect(expenses.filter(entry => entry.amount === 32.26)).toHaveLength(25)
    expect(expenses.filter(entry => entry.amount === 32.25)).toHaveLength(6)
  })

  it('records every natural day including weekends', () => {
    const summary = summarizeLedger(
      dailyLivingCostProfile,
      [],
      new Date(2026, 7, 1),
      new Date(2026, 7, 4),
      new Date(2026, 7, 3, 23),
      [],
      [],
    )
    const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
    expect(expenses.map(entry => entry.id)).toEqual(expect.arrayContaining([
      'living-cost-2026-8-1',
      'living-cost-2026-8-2',
      'living-cost-2026-8-3',
    ]))
  })

  it('does not add future days of the current month in advance', () => {
    const summary = summarizeLedger(
      dailyLivingCostProfile,
      [],
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 7, 10, 8),
      [],
      [],
    )
    const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
    expect(expenses).toHaveLength(10)
    expect(expenses.some(entry => entry.id === 'living-cost-2026-8-11')).toBe(false)
  })

  it('restarts the exact distribution for each month', () => {
    const summary = summarizeLedger(
      dailyLivingCostProfile,
      [],
      new Date(2026, 7, 1),
      new Date(2026, 9, 1),
      new Date(2026, 9, 1),
      [],
      [],
    )
    const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
    expect(expenses).toHaveLength(61)
    expect(Math.round(summary.expense * 100)).toBe(200_000)
  })

  it('starts from the first explicit daily-ledger selection date, independently of salary history', () => {
    const effectiveFromMidMonth = {
      ...dailyLivingCostProfile,
      salaryEffectiveDate: '2026-08-01',
      livingCostHistory: [{
        version: 1 as const,
        effectiveFrom: '2026-08-15',
        mode: 'daily-ledger' as const,
        monthlyAmount: 1000,
      }],
    }
    const summary = summarizeLedger(
      effectiveFromMidMonth,
      [],
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 8, 1),
      [],
      [],
    )
    const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
    expect(expenses).toHaveLength(17)
    expect(expenses.some(entry => entry.id === 'living-cost-2026-8-14')).toBe(false)
    expect(expenses.some(entry => entry.id === 'living-cost-2026-8-15')).toBe(true)
    expect(Math.round(summary.expense * 100)).toBe(54_836)
  })

  it('keeps prior expenses but stops on the day it is switched off or back to deduction', () => {
    const switchedOff = summarizeLedger(
      {
        ...dailyLivingCostProfile,
        includeLivingCost: false,
        livingCostHistory: [
          ...dailyLivingCostProfile.livingCostHistory,
          { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'off' as const, monthlyAmount: 1000 },
        ],
      },
      [],
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 8, 1),
      [],
      [],
    )
    const switchedToDeduct = summarizeLedger(
      {
        ...dailyLivingCostProfile,
        livingCostMode: 'deduct',
        livingCostHistory: [
          ...dailyLivingCostProfile.livingCostHistory,
          { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'deduct' as const, monthlyAmount: 1000 },
        ],
      },
      [],
      new Date(2026, 7, 1),
      new Date(2026, 8, 1),
      new Date(2026, 8, 1),
      [],
      [],
    )
    for (const summary of [switchedOff, switchedToDeduct]) {
      const expenses = summary.entries.filter(entry => entry.kind === 'living_cost')
      expect(expenses).toHaveLength(14)
      expect(expenses.some(entry => entry.id === 'living-cost-2026-8-14')).toBe(true)
      expect(expenses.some(entry => entry.id === 'living-cost-2026-8-15')).toBe(false)
    }
  })

  it('uses a changed amount from that day without rewriting the previous day', () => {
    const changed = {
      ...dailyLivingCostProfile,
      monthlyLivingCost: 2000,
      livingCostHistory: [
        ...dailyLivingCostProfile.livingCostHistory,
        { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'daily-ledger' as const, monthlyAmount: 2000 },
      ],
    }
    const summary = summarizeLedger(
      changed,
      [],
      new Date(2026, 7, 14),
      new Date(2026, 7, 17),
      new Date(2026, 7, 16, 20),
      [],
      [],
    )
    const amountById = new Map(summary.entries.filter(entry => entry.kind === 'living_cost').map(entry => [entry.id, entry.amount]))
    expect(amountById.get('living-cost-2026-8-14')).toBe(32.26)
    expect(amountById.get('living-cost-2026-8-15')).toBe(64.52)
    expect(amountById.get('living-cost-2026-8-16')).toBe(64.52)
  })

  it('keeps historical salary and daily expenses on the rules effective for each business date', () => {
    const switchedBackToDeduct = {
      ...profile,
      salary: 100,
      salaryType: 'daily' as const,
      monthlyWorkDays: 31,
      workDaysPerWeek: 7,
      includeLivingCost: true,
      monthlyLivingCost: 310,
      livingCostMode: 'deduct' as const,
      livingCostHistory: [
        { version: 1 as const, effectiveFrom: '2026-08-01', mode: 'deduct' as const, monthlyAmount: 310 },
        { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'daily-ledger' as const, monthlyAmount: 310 },
        { version: 1 as const, effectiveFrom: '2026-08-20', mode: 'deduct' as const, monthlyAmount: 310 },
      ],
    }
    const summary = summarizeLedger(
      switchedBackToDeduct,
      [],
      new Date(2026, 7, 14),
      new Date(2026, 7, 17),
      new Date(2026, 7, 17, 20),
      [],
      [],
    )
    const amountById = new Map(summary.entries.map(entry => [entry.id, entry.amount]))

    expect(amountById.get('salary-2026-8-14')).toBe(90)
    expect(amountById.get('living-cost-2026-8-14')).toBeUndefined()
    expect(amountById.get('salary-2026-8-15')).toBe(100)
    expect(amountById.get('living-cost-2026-8-15')).toBe(10)
    expect(amountById.get('salary-2026-8-16')).toBe(100)
    expect(amountById.get('living-cost-2026-8-16')).toBe(10)
  })

  it('does not deduct a daily expense twice from a legacy net salary override on the transition date', () => {
    const transitionProfile = {
      ...profile,
      monthlyWorkDays: 31,
      workDaysPerWeek: 7,
      includeLivingCost: true,
      monthlyLivingCost: 310,
      livingCostMode: 'daily-ledger' as const,
      livingCostHistory: [
        { version: 1 as const, effectiveFrom: '2026-08-01', mode: 'deduct' as const, monthlyAmount: 310 },
        { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'daily-ledger' as const, monthlyAmount: 310 },
      ],
    }
    const legacyNetOverride: LedgerEntry = {
      id: 'legacy-net-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 90,
      source: '旧净工资调整',
      occurredAt: new Date(2026, 7, 15, 12).toISOString(),
      localDate: '2026-08-15',
      replacesId: 'salary-2026-8-15',
    }
    const summary = summarizeLedger(
      transitionProfile,
      [legacyNetOverride],
      new Date(2026, 7, 15),
      new Date(2026, 7, 16),
      new Date(2026, 7, 16),
      [],
      [],
    )

    expect(summary.income).toBe(90)
    expect(summary.expense).toBe(0)
    expect(summary.net).toBe(90)
    expect(summary.entries.some(entry => entry.kind === 'living_cost')).toBe(false)
  })

  it('keeps the daily expense when a salary override is explicitly gross', () => {
    const transitionProfile = {
      ...profile,
      monthlyWorkDays: 31,
      workDaysPerWeek: 7,
      includeLivingCost: true,
      monthlyLivingCost: 310,
      livingCostMode: 'daily-ledger' as const,
      livingCostHistory: [
        { version: 1 as const, effectiveFrom: '2026-08-01', mode: 'deduct' as const, monthlyAmount: 310 },
        { version: 1 as const, effectiveFrom: '2026-08-15', mode: 'daily-ledger' as const, monthlyAmount: 310 },
      ],
    }
    const grossOverride: LedgerEntry = {
      id: 'gross-override',
      kind: 'salary_override',
      direction: 'income',
      amount: 100,
      source: '毛工资调整',
      occurredAt: new Date(2026, 7, 15, 12).toISOString(),
      localDate: '2026-08-15',
      livingCostDeducted: false,
      replacesId: 'salary-2026-8-15',
    }
    const summary = summarizeLedger(
      transitionProfile,
      [grossOverride],
      new Date(2026, 7, 15),
      new Date(2026, 7, 16),
      new Date(2026, 7, 16),
      [],
      [],
    )

    expect(summary.income).toBe(100)
    expect(summary.expense).toBe(10)
    expect(summary.net).toBe(90)
  })
})

describe('official holiday and half-day attendance salary entries', () => {
  const monthlyProfile = {
    ...profile,
    salary: 2175,
    salaryType: 'monthly' as const,
    monthlyWorkDays: 21.75,
  }

  it('keeps one normal day of monthly pay only on a statutory holiday date', () => {
    const statutory = summarizeLedger(monthlyProfile, [], new Date(2026, 8, 25), new Date(2026, 8, 26), new Date(2026, 8, 25, 20), [], [])
    const transferredRest = summarizeLedger(monthlyProfile, [], new Date(2026, 8, 26), new Date(2026, 8, 27), new Date(2026, 8, 26, 20), [], [])
    expect(statutory.income).toBeCloseTo(100)
    expect(statutory.entries[0]?.source).toBe('工资收入 · 中秋 · 法定假日')
    expect(transferredRest.income).toBe(0)
  })

  it('treats an adjusted Sunday as a normal workday without adding a multiplier', () => {
    const summary = summarizeLedger(monthlyProfile, [], new Date(2026, 8, 20), new Date(2026, 8, 21), new Date(2026, 8, 20, 20), [], [])
    expect(summary.income).toBeCloseTo(100)
    expect(summary.entries[0]?.source).toBe('工资收入')
  })

  it('lets manual attendance override an official transferred rest day', () => {
    const manual: AttendanceRecord[] = [{ date: '2026-09-26', status: 'normal', updatedAt: now.toISOString() }]
    const summary = summarizeLedger(monthlyProfile, [], new Date(2026, 8, 26), new Date(2026, 8, 27), new Date(2026, 8, 27), [], manual)
    expect(summary.income).toBeCloseTo(100)
  })

  it('combines the remaining normal half with each half-day leave pay mode', () => {
    const base = { date: '2026-09-24', status: 'leave' as const, leaveType: 'personal' as const, leavePeriod: 'morning' as const, updatedAt: now.toISOString() }
    const rangeStart = new Date(2026, 8, 24)
    const rangeEnd = new Date(2026, 8, 25)
    const summaryFor = (record: AttendanceRecord) => summarizeLedger(monthlyProfile, [], rangeStart, rangeEnd, rangeEnd, [], [record])
    expect(summaryFor({ ...base, payMode: 'unpaid' }).income).toBeCloseTo(50)
    expect(summaryFor({ ...base, payMode: 'multiplier', multiplier: 0.8 }).income).toBeCloseTo(90)
    expect(summaryFor({ ...base, payMode: 'fixed', fixedAmount: 20 }).income).toBeCloseTo(70)
  })
})
