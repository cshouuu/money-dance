import { calculateRates, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import { getMonthlyScheduledWorkDayCount, loadChinaHolidaySettings } from './attendance'
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
  const plannedSeconds = workdayCount * rates.paidSecondsPerDay
  let workedSeconds = 0

  const todayValue = toLocalDateValue(now)
  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
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
  const expectedIncome = rates.daily * currentRateProfile.monthlyWorkDays + additionalIncome
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
