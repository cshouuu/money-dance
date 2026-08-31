import { calculateRates, DEFAULT_PROFILE } from '@salary-flow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import {
  closeActiveWorkSession,
  commitFlexibleOvertimeSettlement,
  commitFlexibleWorkCorrection,
  commitFlexibleWorkStart,
  freezeFlexibleWorkForSettlement,
  getAutomaticFlexibleSettlementMode,
  getCurrentWorkRecord,
  getScheduledBusinessDate,
  getFlexibleBaseSettlementAmount,
  getFlexibleOvertimeWindow,
  getFlexibleSettlementRequirement,
  getFlexibleWorkedSeconds,
  hasFlexiblePlannedEndReached,
  isFlexibleStartTimeAllowed,
  resumeFlexibleWork,
  replaceFlexibleWorkTime,
  resolveFlexiblePlannedEndTime,
  settleFlexibleWorkRecord,
  startFlexibleWork,
  summarizeTodayWork,
} from './work'
import { salaryProfileForBusinessDate } from './profile'

afterEach(() => vi.unstubAllGlobals())

const profile = {
  ...DEFAULT_PROFILE,
  salary: 100,
  salaryType: 'daily' as const,
  workDaysPerWeek: 5,
}

const saturday = new Date(2026, 7, 29, 10, 0, 0)
const friday = new Date(2026, 7, 28, 10, 0, 0)

function scheduledRecord(): DailyWorkRecord {
  return { date: '2026-08-29', mode: 'scheduled', status: 'ended', sessions: [], updatedAt: saturday.toISOString() }
}

function attendance(record: Partial<AttendanceRecord>, date = '2026-08-29'): AttendanceRecord[] {
  return [{ date, status: 'normal', updatedAt: saturday.toISOString(), ...record }]
}

function flexibleRecord(end: Date | undefined, status: DailyWorkRecord['status'], settlementMode?: NonNullable<DailyWorkRecord['settlementMode']>): DailyWorkRecord {
  const start = new Date(2026, 7, 28, 9)
  return {
    date: '2026-08-28',
    mode: 'flexible',
    status,
    sessions: [{ id: 'session-1', startTime: start.toISOString(), ...(end ? { endTime: end.toISOString() } : {}) }],
    updatedAt: (end ?? start).toISOString(),
    ...(settlementMode ? { settlementMode } : {}),
  }
}

describe('today workday rules', () => {
  it('does not auto-calculate salary on Saturday for a five-day schedule', () => {
    const summary = summarizeTodayWork(profile, [], saturday)
    expect(summary.dayType).toBe('rest')
    expect(summary.earnedAmount).toBe(0)
    expect(summary.workedSeconds).toBe(0)
  })

  it('continues auto-calculation on configured weekdays', () => {
    const summary = summarizeTodayWork(profile, [], friday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('allows Saturday when the profile is configured for six workdays', () => {
    const summary = summarizeTodayWork({ ...profile, workDaysPerWeek: 6 }, [], saturday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('auto-calculates a big-week Saturday and rests on the following small-week Saturday', () => {
    const alternatingProfile = {
      ...profile,
      workWeekMode: 'alternating' as const,
      alternatingAnchorDate: '2026-08-24',
      alternatingAnchorType: 'big' as const,
    }
    expect(summarizeTodayWork(alternatingProfile, [], saturday).dayType).toBe('work')
    expect(summarizeTodayWork(alternatingProfile, [], new Date(2026, 8, 5, 10)).dayType).toBe('rest')
  })

  it('allows a one-day scheduled override on Saturday', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('allows an explicit normal-attendance override on Saturday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'normal' }))
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeGreaterThan(0)
  })

  it('uses a full-day multiplier for explicit normal attendance', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'normal', payMode: 'multiplier', multiplier: 2 }))
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeCloseTo(200)
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.attendance?.status).toBe('normal')
  })

  it('uses a fixed amount for explicit normal attendance', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'normal', payMode: 'fixed', fixedAmount: 88 }))
    expect(summary.earnedAmount).toBe(88)
    expect(summary.workedSeconds).toBe(3600)
  })

  it('applies unpaid leave before the normal scheduled calculation', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday, undefined, attendance({ status: 'leave', leaveType: 'personal', payMode: 'unpaid' }))
    expect(summary.dayType).toBe('leave')
    expect(summary.earnedAmount).toBe(0)
  })

  it('applies paid leave using the configured multiplier', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'leave', leaveType: 'sick', payMode: 'multiplier', multiplier: 0.8 }))
    expect(summary.dayType).toBe('leave')
    expect(summary.earnedAmount).toBeCloseTo(calculateRates(profile).daily * 0.8)
  })

  it('does not calculate salary for an unpaid holiday', () => {
    const summary = summarizeTodayWork(profile, [scheduledRecord()], saturday, undefined, attendance({ status: 'holiday', payMode: 'unpaid' }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBe(0)
  })

  it('uses the user-defined multiplier for a paid holiday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'holiday', payMode: 'multiplier', multiplier: 1.2 }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBeCloseTo(calculateRates(profile).daily * 1.2)
  })

  it('uses the user-defined fixed amount for a paid holiday', () => {
    const summary = summarizeTodayWork(profile, [], saturday, undefined, attendance({ status: 'holiday', payMode: 'fixed', fixedAmount: 88 }))
    expect(summary.dayType).toBe('holiday')
    expect(summary.earnedAmount).toBe(88)
  })

  it('uses the official China holiday baseline until a saved work record overrides it', () => {
    const nationalDay = new Date(2026, 9, 1, 10)
    const monthly = { ...profile, salary: 2200, salaryType: 'monthly' as const }
    const holiday = summarizeTodayWork(monthly, [], nationalDay)
    expect(holiday.dayType).toBe('holiday')
    expect(holiday.officialHolidayName).toBe('国庆')
    expect(holiday.earnedAmount).toBeGreaterThan(0)

    const manualWork = flexibleRecord(undefined, 'working')
    manualWork.date = '2026-10-01'
    manualWork.sessions = [{ id: 'manual', startTime: new Date(2026, 9, 1, 9).toISOString() }]
    const worked = summarizeTodayWork(monthly, [manualWork], nationalDay)
    expect(worked.dayType).toBe('work')
    expect(worked.workedSeconds).toBe(3600)
  })

  it('keeps half-day leave active while showing only the remaining half-day work progress', () => {
    const morningLeave = attendance({
      status: 'leave',
      leaveType: 'annual',
      leavePeriod: 'morning',
      payMode: 'unpaid',
    }, '2026-08-28')
    const morningSummary = summarizeTodayWork(profile, [], new Date(2026, 7, 28, 10), undefined, morningLeave)
    expect(morningSummary.dayType).toBe('work')
    expect(morningSummary.status).toBe('working')
    expect(morningSummary.workedSeconds).toBe(0)
    expect(morningSummary.earnedAmount).toBeCloseTo(50)

    const afternoonLeave = attendance({
      status: 'leave',
      leaveType: 'annual',
      leavePeriod: 'afternoon',
      payMode: 'unpaid',
    }, '2026-08-28')
    const afternoonSummary = summarizeTodayWork(profile, [], new Date(2026, 7, 28, 15), undefined, afternoonLeave)
    expect(afternoonSummary.dayType).toBe('work')
    expect(afternoonSummary.workedSeconds).toBe(4 * 3600)
    expect(afternoonSummary.earnedAmount).toBeCloseTo(50)
  })

  it('lets a manual half-day leave override a non-configured weekend', () => {
    const saturdayHalfDay = attendance({
      status: 'leave',
      leaveType: 'annual',
      leavePeriod: 'afternoon',
      payMode: 'unpaid',
    })
    const summary = summarizeTodayWork(profile, [], saturday, undefined, saturdayHalfDay)
    expect(summary.dayType).toBe('work')
    expect(summary.earnedAmount).toBeCloseTo(50)
  })

  it('uses the fixed overnight shift start date as its business date', () => {
    const overnight = { ...profile, workStartTime: '22:00', workEndTime: '06:00', paidBreak: true }
    expect(getScheduledBusinessDate(overnight, new Date(2025, 11, 31, 23))).toBe('2025-12-31')
    expect(getScheduledBusinessDate(overnight, new Date(2026, 0, 1, 2))).toBe('2025-12-31')
    expect(getScheduledBusinessDate(overnight, new Date(2026, 0, 1, 12))).toBe('2025-12-31')
    expect(getScheduledBusinessDate(overnight, new Date(2026, 0, 1, 22))).toBe('2026-01-01')
    expect(getScheduledBusinessDate(profile, new Date(2026, 0, 1, 2))).toBe('2026-01-01')
  })

  it('does not let a next-day official holiday interrupt the previous overnight shift', () => {
    const overnight = { ...profile, workStartTime: '22:00', workEndTime: '06:00', paidBreak: true }
    const summary = summarizeTodayWork(overnight, [], new Date(2026, 0, 1, 2))
    expect(summary.dayType).toBe('work')
    expect(summary.workedSeconds).toBe(4 * 3600)
    expect(summary.earnedAmount).toBeCloseTo(50)
  })

  it('uses previous-date manual attendance during an overnight shift', () => {
    const overnight = { ...profile, workStartTime: '22:00', workEndTime: '06:00', paidBreak: true }
    const attendanceRecords: AttendanceRecord[] = [{
      date: '2025-12-31',
      status: 'normal',
      payMode: 'fixed',
      fixedAmount: 88,
      updatedAt: '',
    }, {
      date: '2026-01-01',
      status: 'leave',
      leaveType: 'personal',
      payMode: 'unpaid',
      updatedAt: '',
    }]
    const summary = summarizeTodayWork(overnight, [], new Date(2026, 0, 1, 2), undefined, attendanceRecords)
    expect(summary.dayType).toBe('work')
    expect(summary.attendance?.date).toBe('2025-12-31')
    expect(summary.earnedAmount).toBe(88)
  })

  it('uses the overnight business date living-cost rate after midnight', () => {
    const overnight = {
      ...profile,
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
    const previousRates = calculateRates(salaryProfileForBusinessDate(overnight, '2025-12-31'))
    const currentRates = calculateRates(overnight)
    const carried = summarizeTodayWork(overnight, [], new Date(2026, 0, 1, 2), currentRates)
    const nextShiftRecord: DailyWorkRecord = {
      date: '2026-01-01',
      mode: 'scheduled',
      status: 'ended',
      sessions: [],
      updatedAt: new Date(2026, 0, 1, 22).toISOString(),
    }
    const nextShift = summarizeTodayWork(overnight, [nextShiftRecord], new Date(2026, 0, 1, 22, 30), previousRates)

    expect(carried.businessDate).toBe('2025-12-31')
    expect(carried.earnedAmount).toBeCloseTo(4 * 3600 * previousRates.second)
    expect(nextShift.businessDate).toBe('2026-01-01')
    expect(nextShift.earnedAmount).toBeCloseTo(30 * 60 * currentRates.second)
  })

  it('keeps an overnight holiday at rest, then recognizes the adjusted workday at its own start', () => {
    const values = new Map([['money-dance.china-holiday-calendar.v1', JSON.stringify({ enabled: true, effectiveFrom: '2025-01-01', dataVersion: 'test' })]])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    })
    const overnight = { ...profile, workStartTime: '22:00', workEndTime: '06:00', paidBreak: true }
    const carriedHoliday = summarizeTodayWork(overnight, [], new Date(2026, 0, 4, 2))
    const adjustedStart = summarizeTodayWork(overnight, [], new Date(2026, 0, 4, 22, 30))
    expect(carriedHoliday.dayType).toBe('holiday')
    expect(carriedHoliday.officialHolidayName).toBe('元旦')
    expect(adjustedStart.dayType).toBe('work')
    expect(adjustedStart.workedSeconds).toBe(30 * 60)
  })
})

describe('flexible work settlement', () => {
  it('keeps live earnings based on actual worked time', () => {
    const summary = summarizeTodayWork(profile, [flexibleRecord(undefined, 'working')], new Date(2026, 7, 28, 10))
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBeCloseTo(12.5)
  })

  it('lets a normal-attendance multiplier override live earnings without changing worked time', () => {
    const summary = summarizeTodayWork(
      profile,
      [flexibleRecord(undefined, 'working')],
      new Date(2026, 7, 28, 10),
      undefined,
      attendance({ status: 'normal', payMode: 'multiplier', multiplier: 2 }, '2026-08-28'),
    )
    expect(summary.status).toBe('working')
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBeCloseTo(200)
  })

  it('keeps a normal-attendance custom amount as the base after flexible work exceeds its target', () => {
    const summary = summarizeTodayWork(
      profile,
      [flexibleRecord(new Date(2026, 7, 28, 18), 'ended')],
      new Date(2026, 7, 28, 18),
      undefined,
      attendance({ status: 'normal', payMode: 'multiplier', multiplier: 2 }, '2026-08-28'),
    )
    expect(summary.workedSeconds).toBe(9 * 3600)
    expect(summary.earnedAmount).toBeCloseTo(200)
  })

  it('keeps the combined half-day amount as the base after flexible work exceeds its reduced target', () => {
    const summary = summarizeTodayWork(
      profile,
      [flexibleRecord(new Date(2026, 7, 28, 14), 'ended')],
      new Date(2026, 7, 28, 14),
      undefined,
      attendance({
        status: 'leave',
        leaveType: 'annual',
        leavePeriod: 'morning',
        payMode: 'multiplier',
        multiplier: 0.8,
      }, '2026-08-28'),
    )
    expect(summary.workedSeconds).toBe(5 * 3600)
    expect(summary.earnedAmount).toBeCloseTo(90)
  })

  it('uses zero as the base when worked time becomes overtime during full-day unpaid leave', () => {
    const unpaidLeave: AttendanceRecord = {
      date: '2026-08-28',
      status: 'leave',
      leaveType: 'personal',
      payMode: 'unpaid',
      updatedAt: new Date(2026, 7, 28, 8).toISOString(),
    }
    expect(getFlexibleBaseSettlementAmount(unpaidLeave, 100)).toBe(0)
    expect(getFlexibleBaseSettlementAmount({ ...unpaidLeave, leavePeriod: 'morning' }, 100)).toBe(50)
    expect(getFlexibleBaseSettlementAmount({
      date: '2026-08-28',
      status: 'normal',
      payMode: 'multiplier',
      multiplier: 2,
      updatedAt: unpaidLeave.updatedAt,
    }, 100)).toBe(200)
  })

  it('lets a normal-attendance fixed amount override an actual settlement', () => {
    const summary = summarizeTodayWork(
      profile,
      [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'actual')],
      new Date(2026, 7, 28, 20),
      undefined,
      attendance({ status: 'normal', payMode: 'fixed', fixedAmount: 88 }, '2026-08-28'),
    )
    expect(summary.status).toBe('ended')
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBe(88)
  })

  it('keeps a legacy normal-attendance record on the original flexible calculation', () => {
    const summary = summarizeTodayWork(
      profile,
      [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'actual')],
      new Date(2026, 7, 28, 20),
      undefined,
      attendance({ status: 'normal' }, '2026-08-28'),
    )
    expect(summary.earnedAmount).toBeCloseTo(12.5)
  })

  it('uses the standard daily amount as the multiplier base for hourly salary', () => {
    const hourly = { ...profile, salary: 50, salaryType: 'hourly' as const }
    const summary = summarizeTodayWork(
      hourly,
      [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'actual')],
      new Date(2026, 7, 28, 20),
      undefined,
      attendance({ status: 'normal', payMode: 'multiplier', multiplier: 2 }, '2026-08-28'),
    )
    expect(summary.earnedAmount).toBeCloseTo(800)
  })

  it('settles an early finish using actual time', () => {
    const summary = summarizeTodayWork(profile, [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'actual')], new Date(2026, 7, 28, 20))
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBeCloseTo(12.5)
  })

  it('settles an early finish as a full day without changing actual worked time', () => {
    const summary = summarizeTodayWork(profile, [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'full-day')], new Date(2026, 7, 28, 20))
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBeCloseTo(100)
  })

  it('ignores a stale full-day marker for hourly or active work', () => {
    const hourly = { ...profile, salary: 50, salaryType: 'hourly' as const }
    const ended = summarizeTodayWork(hourly, [flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'full-day')], new Date(2026, 7, 28, 20))
    const active = summarizeTodayWork(profile, [flexibleRecord(undefined, 'working', 'full-day')], new Date(2026, 7, 28, 10))
    expect(ended.earnedAmount).toBeCloseTo(50)
    expect(active.earnedAmount).toBeCloseTo(12.5)
  })

  it('keeps actual work time visible while capping base salary at the daily target', () => {
    const summary = summarizeTodayWork(profile, [flexibleRecord(new Date(2026, 7, 28, 22), 'ended', 'actual')], new Date(2026, 7, 28, 22))
    expect(summary.workedSeconds).toBe(13 * 3600)
    expect(summary.earnedAmount).toBeCloseTo(100)
  })

  it('keeps old records without a settlement mode on actual-time settlement', () => {
    const legacy = flexibleRecord(new Date(2026, 7, 28, 10), 'ended')
    expect(summarizeTodayWork(profile, [legacy], new Date(2026, 7, 28, 20)).earnedAmount).toBeCloseTo(12.5)
  })

  it('persists the selected settlement mode only when ending work', () => {
    const active = flexibleRecord(undefined, 'working')
    const end = new Date(2026, 7, 28, 10)
    const ended = closeActiveWorkSession(active, 'ended', end, 'full-day')
    expect(ended.settlementMode).toBe('full-day')
    expect(ended.sessions.every(session => session.endTime === end.toISOString())).toBe(true)
    expect(closeActiveWorkSession(active, 'paused', end).settlementMode).toBeUndefined()
  })

  it('lets hourly users choose how to settle a short day', () => {
    expect(getAutomaticFlexibleSettlementMode('hourly', 3600, 8 * 3600)).toBeNull()
  })

  it('skips early-finish choices when attendance already overrides the day amount', () => {
    expect(getAutomaticFlexibleSettlementMode('daily', 3600, 8 * 3600, true)).toBe('actual')
    expect(getAutomaticFlexibleSettlementMode('daily', 8 * 3600, 8 * 3600, true)).toBe('full-day')
  })

  it('only settles the exact target automatically', () => {
    expect(getAutomaticFlexibleSettlementMode('daily', 8 * 3600 - 1, 8 * 3600)).toBeNull()
    expect(getAutomaticFlexibleSettlementMode('daily', 8 * 3600, 8 * 3600)).toBe('full-day')
    expect(getAutomaticFlexibleSettlementMode('daily', 8 * 3600 + 1, 8 * 3600)).toBeNull()
  })

  it('classifies under-target, exact-target, and excess work using completed seconds', () => {
    expect(getFlexibleSettlementRequirement(8 * 3600 - 0.01, 8 * 3600)).toBe('under-target')
    expect(getFlexibleSettlementRequirement(8 * 3600 + 0.99, 8 * 3600)).toBe('target-reached')
    expect(getFlexibleSettlementRequirement(8 * 3600 + 1, 8 * 3600)).toBe('over-target')
  })

  it('freezes work before asking for a settlement and can finalize it later', () => {
    const active = flexibleRecord(undefined, 'working')
    const end = new Date(2026, 7, 28, 10)
    const frozen = freezeFlexibleWorkForSettlement(active, end)
    expect(frozen.status).toBe('ended')
    expect(frozen.settlementPending).toBe(true)
    expect(frozen.settlementMode).toBeUndefined()
    expect(frozen.overtimeSessionId).toBeTruthy()
    expect(frozen.sessions.every(session => session.endTime === end.toISOString())).toBe(true)

    const settled = settleFlexibleWorkRecord(frozen, 'full-day')
    expect(settled.settlementPending).toBe(false)
    expect(settled.settlementMode).toBe('full-day')
    expect(settled.overtimeSessionId).toBe(frozen.overtimeSessionId)
  })

  it('supports an explicit full-target settlement for new hourly records without changing legacy records', () => {
    const hourly = { ...profile, salary: 50, salaryType: 'hourly' as const }
    const legacy = flexibleRecord(new Date(2026, 7, 28, 10), 'ended', 'full-day')
    const current = { ...legacy, settlementVersion: 2 as const }
    expect(summarizeTodayWork(hourly, [legacy], new Date(2026, 7, 28, 20)).earnedAmount).toBeCloseTo(50)
    expect(summarizeTodayWork(hourly, [current], new Date(2026, 7, 28, 20)).earnedAmount).toBeCloseTo(400)
  })

  it('extracts only excess working segments and excludes pauses', () => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'ended',
      sessions: [
        { id: 'morning', startTime: new Date(2026, 7, 28, 9).toISOString(), endTime: new Date(2026, 7, 28, 13).toISOString() },
        { id: 'afternoon', startTime: new Date(2026, 7, 28, 14).toISOString(), endTime: new Date(2026, 7, 28, 19).toISOString() },
        { id: 'night', startTime: new Date(2026, 7, 28, 20).toISOString(), endTime: new Date(2026, 7, 28, 21).toISOString() },
      ],
      updatedAt: new Date(2026, 7, 28, 21).toISOString(),
    }
    const overtime = getFlexibleOvertimeWindow(record, 8 * 3600)
    expect(overtime?.durationSeconds).toBe(2 * 3600)
    expect(overtime?.segments).toEqual([
      { startTime: new Date(2026, 7, 28, 18).toISOString(), endTime: new Date(2026, 7, 28, 19).toISOString() },
      { startTime: new Date(2026, 7, 28, 20).toISOString(), endTime: new Date(2026, 7, 28, 21).toISOString() },
    ])
  })

  it('stops an active flexible record at its planned end before settlement is persisted', () => {
    const record = {
      ...flexibleRecord(undefined, 'working'),
      plannedEndTime: new Date(2026, 7, 28, 10).toISOString(),
    }
    const summary = summarizeTodayWork(profile, [record], new Date(2026, 7, 28, 11))
    expect(summary.status).toBe('ended')
    expect(summary.workedSeconds).toBe(3600)
    expect(summary.earnedAmount).toBeCloseTo(12.5)
    expect(hasFlexiblePlannedEndReached(record, new Date(2026, 7, 28, 11))).toBe(true)
  })

  it('freezes a late-opened planned record at the planned time instead of the current time', () => {
    const plannedEnd = new Date(2026, 7, 28, 10)
    const record = {
      ...flexibleRecord(undefined, 'working'),
      plannedEndTime: plannedEnd.toISOString(),
    }
    const frozen = freezeFlexibleWorkForSettlement(record, new Date(2026, 7, 28, 12))
    expect(frozen.sessions[0]?.endTime).toBe(plannedEnd.toISOString())
    expect(getFlexibleOvertimeWindow(frozen, 30 * 60)?.durationSeconds).toBe(30 * 60)
  })

  it('stores an optional planned end and only clears it when work resumes after that deadline', () => {
    const plannedEnd = new Date(2026, 7, 29, 1).toISOString()
    const started = startFlexibleWork('2026-08-28', '23:00', undefined, plannedEnd)
    expect(started.plannedEndTime).toBe(plannedEnd)
    const pausedBeforeEnd = closeActiveWorkSession(started, 'paused', new Date(2026, 7, 29, 0, 30))
    expect(resumeFlexibleWork(pausedBeforeEnd, new Date(2026, 7, 29, 0, 45)).plannedEndTime).toBe(plannedEnd)
    const frozen = freezeFlexibleWorkForSettlement(started, new Date(2026, 7, 29, 2))
    expect(frozen.sessions[0]?.endTime).toBe(plannedEnd)
    expect(resumeFlexibleWork(frozen, new Date(2026, 7, 29, 2)).plannedEndTime).toBeUndefined()
  })

  it('correctly saves a manually adjusted end time after midnight', () => {
    const record = replaceFlexibleWorkTime('2026-08-28', '23:00', '01:00', '2026-08-29')
    expect(record.status).toBe('ended')
    expect(getFlexibleSettlementRequirement(getFlexibleOvertimeWindow(record, 3600)?.durationSeconds ?? 0, 3600)).toBe('target-reached')
    expect(getFlexibleWorkedSeconds(record)).toBe(2 * 3600)
  })

  it('rejects future flexible start times for both quick starts and manual entries', () => {
    const now = new Date(2026, 7, 28, 9, 30)
    expect(isFlexibleStartTimeAllowed('2026-08-28', '09:30', now)).toBe(true)
    expect(isFlexibleStartTimeAllowed('2026-08-28', '09:31', now)).toBe(false)
  })

  it('resolves the same planned end for quick and submitted flexible starts', () => {
    const now = new Date(2026, 7, 28, 9, 30)
    const expected = new Date(2026, 7, 28, 18).toISOString()
    expect(resolveFlexiblePlannedEndTime('2026-08-28', '09:30', '2026-08-28', '18:00', now)).toBe(expected)
    expect(resolveFlexiblePlannedEndTime('2026-08-28', '09:30', '2026-08-28', '', now)).toBeUndefined()
    expect(resolveFlexiblePlannedEndTime('2026-08-28', '19:00', '2026-08-28', '18:00', now)).toBeNull()
  })

  it('carries an unsettled flexible shift across midnight on the dashboard', () => {
    const record: DailyWorkRecord = {
      date: '2026-08-28',
      mode: 'flexible',
      status: 'working',
      sessions: [{ id: 'overnight', startTime: new Date(2026, 7, 28, 23).toISOString() }],
      plannedEndTime: new Date(2026, 7, 29, 1).toISOString(),
      updatedAt: new Date(2026, 7, 28, 23).toISOString(),
    }
    const beforeEnd = summarizeTodayWork(profile, [record], new Date(2026, 7, 29, 0, 30))
    expect(beforeEnd.record?.date).toBe('2026-08-28')
    expect(beforeEnd.status).toBe('working')
    expect(beforeEnd.workedSeconds).toBe(1.5 * 3600)

    const afterEnd = summarizeTodayWork(profile, [record], new Date(2026, 7, 29, 2))
    expect(afterEnd.status).toBe('ended')
    expect(afterEnd.workedSeconds).toBe(2 * 3600)
  })

  it('selects the latest carried pending record when stale pending records coexist', () => {
    const older: DailyWorkRecord = {
      date: '2026-08-27',
      mode: 'flexible',
      status: 'ended',
      settlementPending: true,
      sessions: [{ id: 'older', startTime: new Date(2026, 7, 27, 9).toISOString(), endTime: new Date(2026, 7, 27, 10).toISOString() }],
      updatedAt: new Date(2026, 7, 27, 10).toISOString(),
    }
    const latest: DailyWorkRecord = {
      ...older,
      date: '2026-08-28',
      sessions: [{ id: 'latest', startTime: new Date(2026, 7, 28, 9).toISOString(), endTime: new Date(2026, 7, 28, 10).toISOString() }],
      updatedAt: new Date(2026, 7, 28, 10).toISOString(),
    }
    expect(getCurrentWorkRecord([older, latest], new Date(2026, 7, 29, 9))?.date).toBe('2026-08-28')
  })

  it('never finalizes the work record when an earlier overtime write fails', () => {
    const calls: string[] = []
    const result = commitFlexibleOvertimeSettlement({
      saveOvertimeSession: () => { calls.push('session'); return true },
      saveLedger: () => { calls.push('ledger'); return false },
      saveAchievement: () => { calls.push('achievement'); return true },
      saveWorkRecord: () => { calls.push('work'); return true },
    })
    expect(result).toEqual({ success: false, stage: 'ledger' })
    expect(calls).toEqual(['session', 'ledger'])
  })

  it('does not replace a work record when linked-overtime cleanup fails', () => {
    let workSaved = false
    const result = commitFlexibleWorkCorrection({
      removeLinkedOvertime: () => false,
      saveWorkRecord: () => { workSaved = true; return true },
    })
    expect(result).toEqual({ success: false, stage: 'overtime-cleanup' })
    expect(workSaved).toBe(false)
  })

  it('reports a failed flexible start instead of treating it as persisted', () => {
    let attempts = 0
    expect(commitFlexibleWorkStart(() => { attempts += 1; return false })).toBe(false)
    expect(attempts).toBe(1)
    expect(commitFlexibleWorkStart(() => true)).toBe(true)
    expect(commitFlexibleWorkStart(() => { throw new Error('storage full') })).toBe(false)
  })

  it('retries a partial stable-ID overtime settlement without duplicate records', () => {
    const sessions = new Map<string, number>()
    const ledger = new Map<string, number>()
    let failLedger = true
    let workSettled = false
    const commit = () => commitFlexibleOvertimeSettlement({
      saveOvertimeSession: () => { sessions.set('stable-flex-id', 3600); return true },
      saveLedger: () => {
        if (failLedger) return false
        ledger.set('stable-flex-id', 100)
        return true
      },
      saveAchievement: () => true,
      saveWorkRecord: () => { workSettled = true; return true },
    })

    expect(commit()).toEqual({ success: false, stage: 'ledger' })
    expect(sessions.size).toBe(1)
    expect(workSettled).toBe(false)
    failLedger = false
    expect(commit()).toEqual({ success: true })
    expect(sessions.size).toBe(1)
    expect(ledger.size).toBe(1)
    expect(workSettled).toBe(true)
  })
})
