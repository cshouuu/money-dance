import { calculateRates, isEmployedOn, workStageForDate, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import { getMonthlyScheduledWorkDayCount, loadChinaHolidaySettings, resolveAttendanceDay, getCustomAttendanceAmount, getOfficialHolidayPayAmount, attendanceWorkedFraction } from './attendance'
import { actualPaidIntervalsForDate } from './paidTime'
import { toLocalDateValue, toLocalMonthValue } from './form'
import { getSummaryRange, summarizeLedger } from './ledger'
import { salaryProfileForBusinessDate } from './profile'
import { summarizeTodayWork } from './work'

export interface MonthlyWorkStats {
  income: number
  expectedIncome: number
  workedSeconds: number
  plannedSeconds: number
  workdayCount: number
  progress: number
  averageHourlyIncome: number
}

function completedDayEvaluation(date: Date, profile: SalaryProfile): Date {
  const [startHour = 0, startMinute = 0] = profile.workStartTime.split(':').map(Number)
  const [endHour = 0, endMinute = 0] = profile.workEndTime.split(':').map(Number)
  const crossesMidnight = endHour * 60 + endMinute < startHour * 60 + startMinute
  return crossesMidnight
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12)
    : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function getMonthlyWorkStats(
  profile: SalaryProfile,
  ledger: readonly LedgerEntry[],
  workRecords: readonly DailyWorkRecord[],
  attendanceRecords: readonly AttendanceRecord[],
  now = new Date(),
): MonthlyWorkStats {
  const month = toLocalMonthValue(now)
  const { start, end } = getSummaryRange('month', month)
  const summary = summarizeLedger(profile, [...ledger], start, end, now, [...workRecords], [...attendanceRecords])
  const holidaySettings = loadChinaHolidaySettings(now)
  const currentRateProfile = salaryProfileForBusinessDate(profile, toLocalDateValue(now), [...attendanceRecords], holidaySettings)
  const rates = calculateRates(currentRateProfile)
  const workdayCount = getMonthlyScheduledWorkDayCount(profile, now, attendanceRecords, holidaySettings)
  let plannedSeconds = workdayCount * rates.paidSecondsPerDay
  let plannedSalary = rates.daily * currentRateProfile.monthlyWorkDays
  let workedSeconds = 0

  if (profile.workJourney) {
    plannedSeconds = 0
    plannedSalary = 0
    for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
      const date = toLocalDateValue(cursor)
      if (!isEmployedOn(profile, date) || !workStageForDate(profile, date)?.profile) continue
      const dated = salaryProfileForBusinessDate(profile, date, [...attendanceRecords], holidaySettings)
      const dailyRates = calculateRates(dated)
      const attendance = attendanceRecords.find(record => record.date === date)
      const workday = resolveAttendanceDay(cursor, profile, attendance, holidaySettings).isWorkday
      if (workday) plannedSeconds += dailyRates.paidSecondsPerDay * (attendance ? attendanceWorkedFraction(attendance) : 1)
      const custom = getCustomAttendanceAmount(attendance, dailyRates.daily)
      const holiday = attendance ? null : getOfficialHolidayPayAmount(date, profile, dailyRates.daily, holidaySettings)
      plannedSalary += custom ?? holiday ?? (workday ? dailyRates.daily : 0)
      workedSeconds += actualPaidIntervalsForDate(profile, date, now, [...workRecords], [...attendanceRecords]).reduce((sum, interval) => sum + Math.max(0, Math.min(now.getTime(), interval.end.getTime()) - interval.start.getTime()) / 1000, 0)
    }
  }

  const todayValue = toLocalDateValue(now)
  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    if (profile.workJourney) break
    const date = new Date(cursor)
    date.setHours(12, 0, 0, 0)
    const dateValue = toLocalDateValue(date)
    if (dateValue > todayValue) break
    const evaluation = dateValue === todayValue ? now : completedDayEvaluation(date, profile)
    const day = summarizeTodayWork(profile, [...workRecords], evaluation, undefined, [...attendanceRecords])
    if (day.businessDate === dateValue) workedSeconds += day.workedSeconds
  }

  const additionalIncome = summary.entries
    .filter(entry => entry.direction === 'income' && entry.category !== '薪资')
    .reduce((total, entry) => total + entry.amount, 0)
  const expectedIncome = plannedSalary + additionalIncome
  return {
    income: summary.income,
    expectedIncome,
    workedSeconds,
    plannedSeconds,
    workdayCount,
    progress: plannedSeconds > 0 ? Math.min(1, Math.max(0, workedSeconds / plannedSeconds)) : 0,
    averageHourlyIncome: workedSeconds > 0 ? summary.income / (workedSeconds / 3600) : 0,
  }
}
