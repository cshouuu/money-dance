import { calculateRates, parseClock, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { attendanceLeavePeriod, isConfiguredWorkday, isHalfDayLeave, loadChinaHolidaySettings, type ChinaHolidaySettings } from './attendance'
import { localDateWithTime, toLocalDateTime, toLocalDateValue } from './form'
import { salaryProfileForBusinessDate } from './profile'

const DAY_SECONDS = 24 * 60 * 60
const MAX_INTERVAL_DAYS = 3660

export interface PaidTimeInterval {
  start: Date
  end: Date
  businessDate: string
}

export interface PaidTimeEarnings {
  elapsedSeconds: number
  paidSeconds: number
  earnedAmount: number
}

function clockDuration(start: number, end: number): number {
  return end >= start ? end - start : DAY_SECONDS - start + end
}

function clockPosition(clock: number, shiftStart: number): number {
  return clock >= shiftStart ? clock - shiftStart : DAY_SECONDS - shiftStart + clock
}

function datePlusDays(value: string, days: number): Date {
  const date = toLocalDateTime(value)
  date.setDate(date.getDate() + days)
  return date
}

function intervalAtOffset(shiftStart: Date, startSeconds: number, endSeconds: number, businessDate: string): PaidTimeInterval | null {
  if (endSeconds <= startSeconds) return null
  const start = new Date(shiftStart.getTime() + startSeconds * 1000)
  const end = new Date(shiftStart.getTime() + endSeconds * 1000)
  return end > start ? { start, end, businessDate } : null
}

/** Paid slices for one configured shift, with an unpaid break removed. */
export function scheduledPaidIntervalsForDate(profile: SalaryProfile, businessDate: string): PaidTimeInterval[] {
  let shiftStartClock: number
  let shiftEndClock: number
  let breakStartClock: number
  let breakEndClock: number
  try {
    shiftStartClock = parseClock(profile.workStartTime)
    shiftEndClock = parseClock(profile.workEndTime)
    breakStartClock = parseClock(profile.breakStartTime)
    breakEndClock = parseClock(profile.breakEndTime)
  } catch {
    return []
  }

  const shiftDuration = clockDuration(shiftStartClock, shiftEndClock)
  if (shiftDuration <= 0) return []
  const shiftStart = localDateWithTime(businessDate, profile.workStartTime)
  if (profile.paidBreak) {
    const interval = intervalAtOffset(shiftStart, 0, shiftDuration, businessDate)
    return interval ? [interval] : []
  }

  const breakStart = clockPosition(breakStartClock, shiftStartClock)
  const breakEnd = breakStart + clockDuration(breakStartClock, breakEndClock)
  const clippedBreakStart = Math.max(0, Math.min(shiftDuration, breakStart))
  const clippedBreakEnd = Math.max(clippedBreakStart, Math.min(shiftDuration, breakEnd))
  if (clippedBreakEnd <= clippedBreakStart) {
    const interval = intervalAtOffset(shiftStart, 0, shiftDuration, businessDate)
    return interval ? [interval] : []
  }

  return [
    intervalAtOffset(shiftStart, 0, clippedBreakStart, businessDate),
    intervalAtOffset(shiftStart, clippedBreakEnd, shiftDuration, businessDate),
  ].filter((interval): interval is PaidTimeInterval => interval !== null)
}

function intervalDurationSeconds(interval: PaidTimeInterval): number {
  return Math.max(0, interval.end.getTime() - interval.start.getTime()) / 1000
}

function sliceIntervalsByPaidOffset(
  intervals: readonly PaidTimeInterval[],
  startOffset: number,
  endOffset: number,
): PaidTimeInterval[] {
  const result: PaidTimeInterval[] = []
  let cursor = 0
  for (const interval of intervals) {
    const duration = intervalDurationSeconds(interval)
    const overlapStart = Math.max(startOffset, cursor)
    const overlapEnd = Math.min(endOffset, cursor + duration)
    if (overlapEnd > overlapStart) {
      result.push({
        start: new Date(interval.start.getTime() + (overlapStart - cursor) * 1000),
        end: new Date(interval.start.getTime() + (overlapEnd - cursor) * 1000),
        businessDate: interval.businessDate,
      })
    }
    cursor += duration
  }
  return result
}

function flexiblePaidIntervals(
  record: DailyWorkRecord,
  rangeEnd: Date,
): PaidTimeInterval[] {
  return record.sessions.flatMap(session => {
    const start = new Date(session.startTime)
    const end = session.endTime ? new Date(session.endTime) : rangeEnd
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
    return [{ start, end, businessDate: record.date }]
  })
}

function attendanceForDate(records: readonly AttendanceRecord[], date: string): AttendanceRecord | undefined {
  return records.find(record => record.date === date)
}

function workRecordForDate(records: readonly DailyWorkRecord[], date: string): DailyWorkRecord | undefined {
  return records.find(record => record.date === date)
}

/** Actual paid-work slices used by slacking and earned-time progress. */
export function actualPaidIntervalsForDate(
  profile: SalaryProfile,
  businessDate: string,
  rangeEnd: Date,
  workRecords: readonly DailyWorkRecord[] = [],
  attendanceRecords: readonly AttendanceRecord[] = [],
  settings: ChinaHolidaySettings = loadChinaHolidaySettings(toLocalDateTime(businessDate)),
): PaidTimeInterval[] {
  const attendance = attendanceForDate(attendanceRecords, businessDate)
  const record = workRecordForDate(workRecords, businessDate)
  if (record?.mode === 'flexible') return flexiblePaidIntervals(record, rangeEnd)
  if (attendance && (attendance.status === 'holiday' || (attendance.status === 'leave' && !isHalfDayLeave(attendance)))) return []

  const isWorkday = record?.mode === 'scheduled'
    || attendance?.status === 'normal'
    || isHalfDayLeave(attendance)
    || isConfiguredWorkday(toLocalDateTime(businessDate), profile, settings)
  if (!isWorkday || (!record && profile.defaultWorkMode === 'flexible')) return []

  const intervals = scheduledPaidIntervalsForDate(profile, businessDate)
  if (!isHalfDayLeave(attendance)) return intervals
  const paidSeconds = intervals.reduce((total, interval) => total + intervalDurationSeconds(interval), 0)
  const half = paidSeconds / 2
  return attendanceLeavePeriod(attendance) === 'morning'
    ? sliceIntervalsByPaidOffset(intervals, half, paidSeconds)
    : sliceIntervalsByPaidOffset(intervals, 0, half)
}

/** Planned future slices; flexible users still use their configured target schedule. */
export function plannedPaidIntervalsForDate(
  profile: SalaryProfile,
  businessDate: string,
  attendanceRecords: readonly AttendanceRecord[] = [],
  settings: ChinaHolidaySettings = loadChinaHolidaySettings(toLocalDateTime(businessDate)),
): PaidTimeInterval[] {
  const attendance = attendanceForDate(attendanceRecords, businessDate)
  if (attendance?.status === 'holiday' || (attendance?.status === 'leave' && !isHalfDayLeave(attendance))) return []
  if (!(attendance?.status === 'normal' || isHalfDayLeave(attendance) || isConfiguredWorkday(toLocalDateTime(businessDate), profile, settings))) return []
  const intervals = scheduledPaidIntervalsForDate(profile, businessDate)
  if (!isHalfDayLeave(attendance)) return intervals
  const paidSeconds = intervals.reduce((total, interval) => total + intervalDurationSeconds(interval), 0)
  const half = paidSeconds / 2
  return attendanceLeavePeriod(attendance) === 'morning'
    ? sliceIntervalsByPaidOffset(intervals, half, paidSeconds)
    : sliceIntervalsByPaidOffset(intervals, 0, half)
}

function candidateBusinessDates(start: Date, end: Date): string[] {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 12)
  const finalDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12)
  const dates: string[] = []
  for (let count = 0; cursor <= finalDate && count < MAX_INTERVAL_DAYS; count += 1) {
    dates.push(toLocalDateValue(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function clippedInterval(interval: PaidTimeInterval, rangeStart: Date, rangeEnd: Date): PaidTimeInterval | null {
  const start = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()))
  const end = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()))
  return end > start ? { ...interval, start, end } : null
}

function mergeIntervals(intervals: PaidTimeInterval[]): PaidTimeInterval[] {
  const sorted = [...intervals].sort((left, right) => left.start.getTime() - right.start.getTime())
  const result: PaidTimeInterval[] = []
  for (const interval of sorted) {
    const previous = result.at(-1)
    if (previous && interval.start <= previous.end && interval.businessDate === previous.businessDate) {
      if (interval.end > previous.end) previous.end = interval.end
    } else result.push({ ...interval })
  }
  return result
}

export function calculatePaidTimeEarnings(
  profile: SalaryProfile,
  startValue: string | Date,
  endValue: string | Date,
  workRecords: readonly DailyWorkRecord[] = [],
  attendanceRecords: readonly AttendanceRecord[] = [],
  settings = loadChinaHolidaySettings(startValue instanceof Date ? startValue : new Date(startValue)),
): PaidTimeEarnings {
  const start = startValue instanceof Date ? startValue : new Date(startValue)
  const end = endValue instanceof Date ? endValue : new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { elapsedSeconds: 0, paidSeconds: 0, earnedAmount: 0 }
  }

  const intervals = mergeIntervals(candidateBusinessDates(start, end).flatMap(date => (
    actualPaidIntervalsForDate(profile, date, end, workRecords, attendanceRecords, settings)
      .map(interval => clippedInterval(interval, start, end))
      .filter((interval): interval is PaidTimeInterval => interval !== null)
  )))
  let paidSeconds = 0
  let earnedAmount = 0
  for (const interval of intervals) {
    const seconds = intervalDurationSeconds(interval)
    const datedProfile = salaryProfileForBusinessDate(profile, interval.businessDate, [...attendanceRecords], settings)
    paidSeconds += seconds
    earnedAmount += seconds * calculateRates(datedProfile).second
  }
  return {
    elapsedSeconds: (end.getTime() - start.getTime()) / 1000,
    paidSeconds,
    earnedAmount,
  }
}

/** Finds the instant at which future planned paid work consumes a duration. */
export function estimatePaidWorkCompletionDate(
  profile: SalaryProfile,
  startValue: string | Date,
  requiredPaidSeconds: number,
  attendanceRecords: readonly AttendanceRecord[] = [],
  settings = loadChinaHolidaySettings(startValue instanceof Date ? startValue : new Date(startValue)),
): Date | null {
  const start = startValue instanceof Date ? new Date(startValue) : new Date(startValue)
  if (Number.isNaN(start.getTime()) || !Number.isFinite(requiredPaidSeconds)) return null
  if (requiredPaidSeconds <= 0) return start
  let remaining = requiredPaidSeconds
  const firstBusinessDate = toLocalDateValue(datePlusDays(toLocalDateValue(start), -1))
  let businessDate = firstBusinessDate

  for (let count = 0; count < MAX_INTERVAL_DAYS; count += 1) {
    for (const interval of plannedPaidIntervalsForDate(profile, businessDate, attendanceRecords, settings)) {
      const intervalStart = new Date(Math.max(start.getTime(), interval.start.getTime()))
      if (interval.end <= intervalStart) continue
      const available = Math.max(0, interval.end.getTime() - intervalStart.getTime()) / 1000
      if (remaining <= available) return new Date(intervalStart.getTime() + remaining * 1000)
      remaining -= available
    }
    businessDate = toLocalDateValue(datePlusDays(businessDate, 1))
  }
  return null
}

/** Finds the instant at which future planned paid work earns a target amount. */
export function estimatePaidEarningsCompletionDate(
  profile: SalaryProfile,
  startValue: string | Date,
  requiredAmount: number,
  attendanceRecords: readonly AttendanceRecord[] = [],
  settings = loadChinaHolidaySettings(startValue instanceof Date ? startValue : new Date(startValue)),
): Date | null {
  const start = startValue instanceof Date ? new Date(startValue) : new Date(startValue)
  if (Number.isNaN(start.getTime()) || !Number.isFinite(requiredAmount)) return null
  if (requiredAmount <= 0) return start
  let remaining = requiredAmount
  const firstBusinessDate = toLocalDateValue(datePlusDays(toLocalDateValue(start), -1))
  let businessDate = firstBusinessDate

  for (let count = 0; count < MAX_INTERVAL_DAYS; count += 1) {
    const datedProfile = salaryProfileForBusinessDate(profile, businessDate, [...attendanceRecords], settings)
    const secondRate = calculateRates(datedProfile).second
    if (secondRate > 0) {
      for (const interval of plannedPaidIntervalsForDate(profile, businessDate, attendanceRecords, settings)) {
        const intervalStart = new Date(Math.max(start.getTime(), interval.start.getTime()))
        if (interval.end <= intervalStart) continue
        const availableSeconds = Math.max(0, interval.end.getTime() - intervalStart.getTime()) / 1000
        const availableAmount = availableSeconds * secondRate
        if (remaining <= availableAmount) {
          return new Date(intervalStart.getTime() + (remaining / secondRate) * 1000)
        }
        remaining -= availableAmount
      }
    }
    businessDate = toLocalDateValue(datePlusDays(businessDate, 1))
  }
  return null
}
