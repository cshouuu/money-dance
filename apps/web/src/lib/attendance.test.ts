import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import bundled from './chinaHolidays.data.json'
import { CHINA_HOLIDAY_DATA_KEY, updateChinaHolidays } from './chinaHolidays'
import { alternatingWeekTypeForDate, attendancePayModeLabel, attendanceStatusLabel, attendanceWorkedFraction, chinaHolidayForDate, getCustomAttendanceAmount, getMonthlyPaidDayCount, getMonthlyScheduledWorkDayCount, getOfficialHolidayPayAmount, getWeekStartDateValue, isConfiguredWorkday, resolveAttendanceDay, saveAttendanceRecords, saveChinaHolidaySettings, type ChinaHolidaySettings } from './attendance'

afterEach(() => vi.unstubAllGlobals())

const alternatingProfile: SalaryProfile = {
  ...DEFAULT_PROFILE,
  workWeekMode: 'alternating',
  alternatingAnchorDate: '2026-08-24',
  alternatingAnchorType: 'big',
}

const holidaySettings: ChinaHolidaySettings = {
  enabled: true,
  effectiveFrom: '2026-01-01',
  dataVersion: 'test',
}

describe('alternating workweek', () => {
  it('normalizes a date to the local Monday', () => {
    expect(getWeekStartDateValue(new Date(2026, 7, 29, 12))).toBe('2026-08-24')
  })

  it('works Monday through Saturday during a big week', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 7, 29, 12), alternatingProfile)).toBe('big')
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), alternatingProfile)).toBe(true)
    expect(isConfiguredWorkday(new Date(2026, 7, 30, 12), alternatingProfile)).toBe(false)
  })

  it('rests on Saturday during the following small week', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 8, 5, 12), alternatingProfile)).toBe('small')
    expect(isConfiguredWorkday(new Date(2026, 8, 5, 12), alternatingProfile)).toBe(false)
  })

  it('alternates correctly before the anchor and across years', () => {
    expect(alternatingWeekTypeForDate(new Date(2026, 7, 22, 12), alternatingProfile)).toBe('small')
    expect(alternatingWeekTypeForDate(new Date(2027, 0, 2, 12), alternatingProfile)).toBe('big')
    expect(alternatingWeekTypeForDate(new Date(2027, 0, 9, 12), alternatingProfile)).toBe('small')
  })

  it('supports anchoring the current week as a small week', () => {
    const profile = { ...alternatingProfile, alternatingAnchorType: 'small' as const }
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), profile)).toBe(false)
    expect(isConfiguredWorkday(new Date(2026, 8, 5, 12), profile)).toBe(true)
  })

  it('keeps the existing fixed workweek behavior', () => {
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), { ...DEFAULT_PROFILE, workDaysPerWeek: 5 })).toBe(false)
    expect(isConfiguredWorkday(new Date(2026, 7, 29, 12), { ...DEFAULT_PROFILE, workDaysPerWeek: 6 })).toBe(true)
  })
})

describe('attendanceStatusLabel', () => {
  it('distinguishes paid and unpaid holidays', () => {
    expect(attendanceStatusLabel({ date: '2026-08-29', status: 'holiday', payMode: 'multiplier', multiplier: 1, updatedAt: '' })).toBe('带薪假')
    expect(attendanceStatusLabel({ date: '2026-08-29', status: 'holiday', payMode: 'unpaid', updatedAt: '' })).toBe('无薪假')
  })

  it('formats normal-attendance pay adjustments', () => {
    const multiplier = { date: '2026-08-29', status: 'normal' as const, payMode: 'multiplier' as const, multiplier: 2, updatedAt: '' }
    const fixed = { date: '2026-08-29', status: 'normal' as const, payMode: 'fixed' as const, fixedAmount: 88, updatedAt: '' }
    expect(getCustomAttendanceAmount(multiplier, 100)).toBe(200)
    expect(getCustomAttendanceAmount(fixed, 100)).toBe(88)
    expect(attendancePayModeLabel(multiplier)).toBe('2 倍计薪')
    expect(attendancePayModeLabel(fixed)).toBe('固定 ¥88.00')
  })

  it('keeps normal attendance without a pay mode on automatic salary', () => {
    const automatic = { date: '2026-08-29', status: 'normal' as const, updatedAt: '' }
    expect(getCustomAttendanceAmount(automatic, 100)).toBeNull()
    expect(attendancePayModeLabel(automatic)).toBeNull()
  })

  it('calculates an unpaid half-day leave as half normal attendance', () => {
    const morningLeave = { date: '2026-08-29', status: 'leave' as const, leaveType: 'personal' as const, leavePeriod: 'morning' as const, payMode: 'unpaid' as const, updatedAt: '' }
    expect(attendanceStatusLabel(morningLeave)).toBe('上午事假')
    expect(attendanceWorkedFraction(morningLeave)).toBe(0.5)
    expect(getCustomAttendanceAmount(morningLeave, 100)).toBe(50)
    expect(attendancePayModeLabel(morningLeave)).toBe('半日正常工资')
  })

  it('combines half normal attendance with paid half-day leave', () => {
    const afternoonLeave = { date: '2026-08-29', status: 'leave' as const, leaveType: 'annual' as const, leavePeriod: 'afternoon' as const, payMode: 'multiplier' as const, multiplier: 0.8, updatedAt: '' }
    expect(attendanceStatusLabel(afternoonLeave)).toBe('下午年假')
    expect(getCustomAttendanceAmount(afternoonLeave, 100)).toBe(90)
  })

  it('adds a fixed leave-half amount to the remaining half-day normal salary', () => {
    const fixed = { date: '2026-08-29', status: 'leave' as const, leaveType: 'sick' as const, leavePeriod: 'morning' as const, payMode: 'fixed' as const, fixedAmount: 88, updatedAt: '' }
    expect(getCustomAttendanceAmount(fixed, 100)).toBe(138)
    expect(attendancePayModeLabel(fixed)).toBe('半天固定 ¥88.00')
  })
})

describe('China holiday workday priority', () => {
  it('uses 2027 breaks, makeup workdays and statutory pay without overriding manual attendance', () => {
    const profile = { ...DEFAULT_PROFILE, salaryType: 'monthly' as const, workDaysPerWeek: 5 }
    expect(resolveAttendanceDay(new Date(2027, 1, 5, 12), profile, undefined, holidaySettings)).toMatchObject({ source: 'china-holiday', isWorkday: false })
    expect(resolveAttendanceDay(new Date(2027, 0, 31, 12), profile, undefined, holidaySettings)).toMatchObject({ source: 'china-holiday', isWorkday: true })
    expect(getOfficialHolidayPayAmount('2027-02-05', profile, 100, holidaySettings)).toBe(100)
    expect(getOfficialHolidayPayAmount('2027-02-09', profile, 100, holidaySettings)).toBe(0)
    expect(getOfficialHolidayPayAmount('2027-02-05', { ...profile, salaryType: 'hourly' }, 100, holidaySettings)).toBe(0)
    expect(resolveAttendanceDay(new Date(2027, 1, 5, 12), profile, { date: '2027-02-05', status: 'normal', updatedAt: '' }, holidaySettings)).toMatchObject({ source: 'manual', isWorkday: true })
    expect(chinaHolidayForDate('2027-02-05', { ...holidaySettings, effectiveFrom: '2027-02-06' })).toBeUndefined()
  })

  it('uses downloaded corrections in salary calculations while preserving activation and manual records', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    const data = structuredClone(bundled)
    data.version = '2098.1'
    data.years[2027].holidays.push({ name: '测试调整', start: '2027-06-10', end: '2027-06-10' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))))
    await updateChinaHolidays()
    const profile = { ...DEFAULT_PROFILE, salaryType: 'monthly' as const }
    expect(values.has(CHINA_HOLIDAY_DATA_KEY)).toBe(true)
    expect(getOfficialHolidayPayAmount('2027-06-10', profile, 100, holidaySettings)).toBe(0)
    expect(chinaHolidayForDate('2027-06-10', { ...holidaySettings, enabled: false })).toBeUndefined()
    expect(chinaHolidayForDate('2027-06-10', { ...holidaySettings, effectiveFrom: '2027-06-11' })).toBeUndefined()
    expect(resolveAttendanceDay(new Date(2027, 5, 10, 12), profile, { date: '2027-06-10', status: 'normal', updatedAt: '' }, holidaySettings)).toMatchObject({ source: 'manual', isWorkday: true })
  })
  it('overrides fixed and alternating weeks after the feature effective date', () => {
    const fiveDayProfile = { ...alternatingProfile, workWeekMode: 'fixed' as const, workDaysPerWeek: 5 }
    expect(isConfiguredWorkday(new Date(2026, 1, 17, 12), fiveDayProfile, holidaySettings)).toBe(false)
    expect(isConfiguredWorkday(new Date(2026, 1, 28, 12), fiveDayProfile, holidaySettings)).toBe(true)
  })

  it('lets a manual attendance record override the official baseline', () => {
    const manualWork = { date: '2026-02-17', status: 'normal' as const, updatedAt: '' }
    const manualLeave = { date: '2026-02-28', status: 'leave' as const, leaveType: 'personal' as const, payMode: 'unpaid' as const, updatedAt: '' }
    expect(resolveAttendanceDay(new Date(2026, 1, 17, 12), alternatingProfile, manualWork, holidaySettings)).toMatchObject({ isWorkday: true, source: 'manual' })
    expect(resolveAttendanceDay(new Date(2026, 1, 28, 12), alternatingProfile, manualLeave, holidaySettings)).toMatchObject({ isWorkday: false, source: 'manual' })
  })

  it('does not rewrite dates before activation and falls back for unknown years', () => {
    const futureOnly = { ...holidaySettings, effectiveFrom: '2026-03-01' }
    expect(chinaHolidayForDate('2026-02-17', futureOnly)).toBeUndefined()
    expect(resolveAttendanceDay(new Date(2028, 0, 2, 12), { ...alternatingProfile, workWeekMode: 'fixed', workDaysPerWeek: 5 }, undefined, holidaySettings)).toMatchObject({ source: 'profile', isWorkday: false })
  })

  it('can be disabled without changing the profile fallback', () => {
    const disabled = { ...holidaySettings, enabled: false }
    const sunday = new Date(2026, 0, 4, 12)
    expect(isConfiguredWorkday(sunday, { ...alternatingProfile, workWeekMode: 'fixed', workDaysPerWeek: 5 }, disabled)).toBe(false)
    expect(isConfiguredWorkday(sunday, { ...alternatingProfile, workWeekMode: 'fixed', workDaysPerWeek: 5 }, holidaySettings)).toBe(true)
  })

  it('keeps normal pay for monthly and annual official rest days without inventing overtime pay', () => {
    expect(getOfficialHolidayPayAmount('2026-09-25', { ...alternatingProfile, salaryType: 'monthly' }, 100, holidaySettings)).toBe(100)
    expect(getOfficialHolidayPayAmount('2026-09-25', { ...alternatingProfile, salaryType: 'annual' }, 100, holidaySettings)).toBe(100)
    expect(getOfficialHolidayPayAmount('2026-09-25', { ...alternatingProfile, salaryType: 'daily' }, 100, holidaySettings)).toBe(0)
    expect(getOfficialHolidayPayAmount('2026-09-25', { ...alternatingProfile, salaryType: 'hourly' }, 100, holidaySettings)).toBe(0)
    expect(getOfficialHolidayPayAmount('2026-02-15', { ...alternatingProfile, salaryType: 'monthly' }, 100, holidaySettings)).toBe(0)
    expect(getOfficialHolidayPayAmount('2026-09-20', alternatingProfile, 100, holidaySettings)).toBeNull()
  })
})

describe('calendar month paid-day count', () => {
  const disabledSettings = { ...holidaySettings, enabled: false }

  it('counts the actual weekdays in a calendar month', () => {
    expect(getMonthlyPaidDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [], disabledSettings)).toBe(21)
  })

  it('keeps personal leave in the denominator but removes an explicit company holiday', () => {
    const leave = { date: '2026-08-03', status: 'leave' as const, leaveType: 'personal' as const, payMode: 'unpaid' as const, updatedAt: '' }
    const companyHoliday = { date: '2026-08-04', status: 'holiday' as const, payMode: 'unpaid' as const, updatedAt: '' }
    expect(getMonthlyPaidDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [leave], disabledSettings)).toBe(21)
    expect(getMonthlyPaidDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [companyHoliday], disabledSettings)).toBe(20)
    expect(getMonthlyScheduledWorkDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [leave], disabledSettings)).toBe(20)
    expect(getMonthlyScheduledWorkDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [companyHoliday], disabledSettings)).toBe(20)
  })

  it('counts half-day leave as half a planned workday', () => {
    const halfDayLeave = { date: '2026-08-03', status: 'leave' as const, leaveType: 'annual' as const, leavePeriod: 'morning' as const, updatedAt: '' }
    expect(getMonthlyScheduledWorkDayCount(DEFAULT_PROFILE, new Date(2026, 7, 1, 12), [halfDayLeave], disabledSettings)).toBe(20.5)
  })
})

describe('attendance persistence result', () => {
  it('reports storage failure instead of pretending the record was saved', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota exceeded') } })
    expect(saveAttendanceRecords([{ date: '2026-09-01', status: 'normal', updatedAt: '' }])).toBe(false)
  })

  it('reports storage failure instead of toggling China holiday settings in memory', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota exceeded') } })
    expect(saveChinaHolidaySettings(holidaySettings)).toBe(false)
  })
})
