import type { AlternatingWeekType, SalaryProfile } from '@salary-flow/core'
import type { AttendanceLeavePeriod, AttendanceRecord, LeaveType } from '../types'
import { CHINA_HOLIDAY_DATA_VERSION, getChinaHolidayDay, hasChinaHolidayYear, type ChinaHolidayDay } from './chinaHolidays'
import { toLocalDateTime, toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'

const CHINA_HOLIDAY_SETTINGS_KEY = 'money-dance.china-holiday-calendar.v1'
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface ChinaHolidaySettings {
  enabled: boolean
  /** Official data is never applied before this local date. */
  effectiveFrom: string
  dataVersion: string
}

export interface AttendanceDayResolution {
  isWorkday: boolean
  source: 'manual' | 'china-holiday' | 'profile'
  holiday?: ChinaHolidayDay
}

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'personal', label: '事假' },
  { value: 'sick', label: '病假' },
  { value: 'annual', label: '年假' },
  { value: 'compensatory', label: '调休' },
  { value: 'marriage', label: '婚假' },
  { value: 'maternity', label: '产假' },
  { value: 'prenatal', label: '产检假' },
  { value: 'paternity', label: '陪产假' },
  { value: 'parental', label: '育儿假' },
  { value: 'bereavement', label: '丧假' },
  { value: 'remote', label: '远程工作' },
]

export function loadAttendanceRecords(): AttendanceRecord[] {
  return loadJSON<AttendanceRecord[]>(keys.attendanceRecords, [])
}

export function saveAttendanceRecords(records: AttendanceRecord[]): boolean {
  return saveJSON(keys.attendanceRecords, records)
}

export function upsertAttendanceRecord(records: AttendanceRecord[], record: AttendanceRecord): AttendanceRecord[] {
  const existing = records.some(item => item.date === record.date)
  return existing
    ? records.map(item => item.date === record.date ? record : item)
    : [record, ...records]
}

export function loadChinaHolidaySettings(now = new Date()): ChinaHolidaySettings {
  const today = toLocalDateValue(now)
  const stored = loadJSON<Partial<ChinaHolidaySettings>>(CHINA_HOLIDAY_SETTINGS_KEY, {})
  const normalized = {
    enabled: stored.enabled ?? true,
    effectiveFrom: DATE_VALUE_PATTERN.test(stored.effectiveFrom ?? '') ? stored.effectiveFrom! : today,
    dataVersion: CHINA_HOLIDAY_DATA_VERSION,
  }
  if (stored.enabled === undefined || stored.effectiveFrom !== normalized.effectiveFrom || stored.dataVersion !== normalized.dataVersion) {
    saveJSON(CHINA_HOLIDAY_SETTINGS_KEY, normalized)
  }
  return normalized
}

export function saveChinaHolidaySettings(settings: ChinaHolidaySettings): boolean {
  return saveJSON(CHINA_HOLIDAY_SETTINGS_KEY, { ...settings, dataVersion: CHINA_HOLIDAY_DATA_VERSION })
}

export function chinaHolidayForDate(date: string, settings = loadChinaHolidaySettings()): ChinaHolidayDay | undefined {
  if (!settings.enabled || date < settings.effectiveFrom) return undefined
  const year = Number(date.slice(0, 4))
  if (!hasChinaHolidayYear(year)) return undefined
  return getChinaHolidayDay(date)
}

/**
 * Default pay for an official rest day. Only the statutory dates keep one
 * normal day of pay for monthly and annual salaries; transferred rest days,
 * daily salaries and hourly salaries remain zero until the user explicitly
 * overrides that date. A null result means the date is not an official rest
 * day and the normal workday rules should continue.
 */
export function getOfficialHolidayPayAmount(
  date: string,
  profile: SalaryProfile,
  dailyAmount: number,
  settings = loadChinaHolidaySettings(),
): number | null {
  const holiday = chinaHolidayForDate(date, settings)
  if (holiday?.kind !== 'holiday') return null
  return holiday.statutory && (profile.salaryType === 'monthly' || profile.salaryType === 'annual')
    ? Math.max(0, dailyAmount)
    : 0
}

export function leaveTypeLabel(type?: LeaveType): string {
  return LEAVE_TYPES.find(item => item.value === type)?.label ?? '请假'
}

export function attendanceStatusLabel(record: AttendanceRecord): string {
  if (record.status === 'holiday') return record.payMode === 'unpaid' ? '无薪假' : '带薪假'
  if (record.status === 'leave') {
    const period = attendanceLeavePeriod(record)
    const prefix = period === 'morning' ? '上午' : period === 'afternoon' ? '下午' : ''
    return `${prefix}${leaveTypeLabel(record.leaveType)}`
  }
  return '正常上班'
}

export function getCustomAttendanceAmount(record: AttendanceRecord | undefined, dailyAmount: number): number | null {
  const normalizedDailyAmount = Math.max(0, dailyAmount)
  if (isHalfDayLeave(record)) {
    if (record.payMode === 'fixed') return normalizedDailyAmount * 0.5 + Math.max(0, record.fixedAmount ?? 0)
    const leaveMultiplier = record.payMode === 'multiplier' ? Math.max(0, record.multiplier ?? 0) : 0
    return normalizedDailyAmount * 0.5 + normalizedDailyAmount * 0.5 * leaveMultiplier
  }
  if (record?.payMode === 'multiplier') return normalizedDailyAmount * Math.max(0, record.multiplier ?? 0)
  if (record?.payMode === 'fixed') return Math.max(0, record.fixedAmount ?? 0)
  return null
}

export function attendancePayModeLabel(record: AttendanceRecord): string | null {
  if (isHalfDayLeave(record) && record.payMode === 'unpaid') return '半日正常工资'
  if (isHalfDayLeave(record) && record.payMode === 'fixed') return `半天固定 ¥${(record.fixedAmount ?? 0).toFixed(2)}`
  if (record.payMode === 'multiplier') return `${record.multiplier ?? 0} 倍计薪`
  if (record.payMode === 'fixed') return `固定 ¥${(record.fixedAmount ?? 0).toFixed(2)}`
  return null
}

export function attendanceLeavePeriod(record: AttendanceRecord | undefined): AttendanceLeavePeriod {
  if (record?.status !== 'leave') return 'full-day'
  return record.leavePeriod === 'morning' || record.leavePeriod === 'afternoon' ? record.leavePeriod : 'full-day'
}

export function isHalfDayLeave(record: AttendanceRecord | undefined): record is AttendanceRecord & {
  status: 'leave'
  leavePeriod: 'morning' | 'afternoon'
} {
  return record?.status === 'leave' && attendanceLeavePeriod(record) !== 'full-day'
}

/** Fraction of a normal workday that remains after the attendance adjustment. */
export function attendanceWorkedFraction(record: AttendanceRecord | undefined): number {
  if (!record || record.status === 'normal') return 1
  if (isHalfDayLeave(record)) return 0.5
  return 0
}

/** Fraction used by calendar and monthly attendance statistics. */
export function attendanceAdjustedDayValue(record: AttendanceRecord): number {
  return isHalfDayLeave(record) ? 0.5 : 1
}

function weekStart(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const mondayBasedIndex = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - mondayBasedIndex)
  return result
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

export function getWeekStartDateValue(date = new Date()): string {
  return toLocalDateValue(weekStart(date))
}

export function alternatingWeekTypeForDate(date: Date, profile: SalaryProfile): AlternatingWeekType {
  const parsedAnchor = toLocalDateTime(profile.alternatingAnchorDate)
  const anchor = Number.isNaN(parsedAnchor.getTime()) ? weekStart(date) : weekStart(parsedAnchor)
  const target = weekStart(date)
  const difference = Math.round((calendarDayNumber(target) - calendarDayNumber(anchor)) / 7)
  const sameParity = Math.abs(difference) % 2 === 0
  const anchorType = profile.alternatingAnchorType === 'small' ? 'small' : 'big'
  if (sameParity) return anchorType
  return anchorType === 'big' ? 'small' : 'big'
}

function isProfileWorkday(date: Date, profile: SalaryProfile): boolean {
  const mondayBasedIndex = (date.getDay() + 6) % 7
  if (profile.workWeekMode === 'alternating') {
    if (mondayBasedIndex < 5) return true
    if (mondayBasedIndex === 5) return alternatingWeekTypeForDate(date, profile) === 'big'
    return false
  }
  const normalized = Math.min(7, Math.max(1, Math.round(profile.workDaysPerWeek)))
  return mondayBasedIndex < normalized
}

export function resolveAttendanceDay(
  date: Date,
  profile: SalaryProfile,
  record?: AttendanceRecord,
  settings = loadChinaHolidaySettings(),
): AttendanceDayResolution {
  if (record) {
    return {
      isWorkday: record.status === 'normal' || isHalfDayLeave(record),
      source: 'manual',
    }
  }

  const holiday = chinaHolidayForDate(toLocalDateValue(date), settings)
  if (holiday) {
    return {
      isWorkday: holiday.kind === 'adjusted-workday',
      source: 'china-holiday',
      holiday,
    }
  }

  return { isWorkday: isProfileWorkday(date, profile), source: 'profile' }
}

export function isConfiguredWorkday(
  date: Date,
  profile: SalaryProfile,
  settings = loadChinaHolidaySettings(),
): boolean {
  return resolveAttendanceDay(date, profile, undefined, settings).isWorkday
}

/**
 * Counts the days that receive one base salary share in a calendar month.
 * Monthly/annual statutory holidays stay in the denominator because the
 * generated ledger also keeps one normal day of pay for them. Personal leave
 * remains a planned salary day; explicit company holidays can remove a day.
 */
export function getMonthlyPaidDayCount(
  profile: SalaryProfile,
  date: Date,
  records: readonly AttendanceRecord[] = [],
  settings = loadChinaHolidaySettings(date),
): number {
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const recordsByDate = new Map(records.map(record => [record.date, record]))
  let paidDays = 0

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day, 12)
    const dateValue = toLocalDateValue(current)
    const record = recordsByDate.get(dateValue)
    if (record) {
      if (record.status === 'normal' || record.status === 'leave') paidDays += 1
      else if (record.status === 'holiday' && record.payMode !== 'unpaid') paidDays += 1
      continue
    }

    const holiday = chinaHolidayForDate(dateValue, settings)
    if (holiday) {
      if (holiday.kind === 'adjusted-workday') paidDays += 1
      else if (holiday.statutory && (profile.salaryType === 'monthly' || profile.salaryType === 'annual')) paidDays += 1
      continue
    }
    if (isProfileWorkday(current, profile)) paidDays += 1
  }

  return paidDays
}

/** Planned working days for progress and workload statistics (paid rest days excluded). */
export function getMonthlyScheduledWorkDayCount(
  profile: SalaryProfile,
  date: Date,
  records: readonly AttendanceRecord[] = [],
  settings = loadChinaHolidaySettings(date),
): number {
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const recordsByDate = new Map(records.map(record => [record.date, record]))
  let workDays = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day, 12)
    const record = recordsByDate.get(toLocalDateValue(current))
    if (record) {
      workDays += attendanceWorkedFraction(record)
      continue
    }
    if (isConfiguredWorkday(current, profile, settings)) workDays += 1
  }
  return workDays
}
