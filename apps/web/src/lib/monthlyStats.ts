import { calculateRates, isEmployedOn, vacationForDate, workStageForDate, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry, OvertimeSession, SlackingSession } from '../types'
import { monthlyWorkBreakdown, type WorkInterval } from './monthlyWorkBreakdown'
import { getVacationPayAmount, getMonthlyScheduledWorkDayCount, loadChinaHolidaySettings, resolveAttendanceDay, getCustomAttendanceAmount, getOfficialHolidayPayAmount, attendanceWorkedFraction } from './attendance'
import { actualPaidIntervalsForDate } from './paidTime'
import { toLocalDateValue, toLocalMonthValue } from './form'
import { getSummaryRange, summarizeLedger } from './ledger'
import { salaryProfileForBusinessDate } from './profile'

export interface MonthlyWorkStats extends ReturnType<typeof monthlyWorkBreakdown> {
  income: number
  expectedIncome: number
  workedSeconds: number
  plannedSeconds: number
  workdayCount: number
  progress: number
}

export function getMonthlyWorkStats(
  profile: SalaryProfile,
  ledger: readonly LedgerEntry[],
  workRecords: readonly DailyWorkRecord[],
  attendanceRecords: readonly AttendanceRecord[],
  now = new Date(),
  sessions: { overtime?: readonly OvertimeSession[]; slacking?: readonly SlackingSession[] } = {},
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

  const hasVacationThisMonth = !!profile.vacations?.length && Array.from(
    { length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  ).some(date => vacationForDate(profile, date))
  if (profile.workJourney || hasVacationThisMonth) {
    plannedSeconds = 0
    plannedSalary = 0
    for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
      const date = toLocalDateValue(cursor)
      if (!isEmployedOn(profile, date) || (profile.workJourney && !workStageForDate(profile, date)?.profile)) continue
      const dated = salaryProfileForBusinessDate(profile, date, [...attendanceRecords], holidaySettings)
      const dailyRates = calculateRates(dated)
      const attendance = attendanceRecords.find(record => record.date === date)
      const workday = resolveAttendanceDay(cursor, profile, attendance, holidaySettings).isWorkday
      if (workday) plannedSeconds += dailyRates.paidSecondsPerDay * (attendance ? attendanceWorkedFraction(attendance) : 1)
      const customAmount = getCustomAttendanceAmount(attendance, dailyRates.daily)
      const custom = attendance && (attendance.status === 'leave' || attendance.status === 'holiday') ? customAmount ?? 0 : customAmount
      const holiday = attendance ? null : getOfficialHolidayPayAmount(date, profile, dailyRates.daily, holidaySettings)
      const vacationPay = getVacationPayAmount(date, dated, holidaySettings)
      plannedSalary += custom ?? vacationPay ?? holiday ?? (workday ? dailyRates.daily : 0)
    }
  }

  const todayValue = toLocalDateValue(now)
  const additionalIncome = summary.entries
    .filter(entry => entry.direction === 'income' && entry.category !== '薪资')
    .reduce((total, entry) => total + entry.amount, 0)
  const expectedIncome = plannedSalary + additionalIncome
  const normalIntervals: WorkInterval[] = []
  for (const cursor = new Date(start); cursor < end && cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
    normalIntervals.push(...actualPaidIntervalsForDate(profile, toLocalDateValue(cursor), now, workRecords, attendanceRecords, holidaySettings)
      .map(interval => ({ start: interval.start.getTime(), end: Math.min(interval.end.getTime(), now.getTime()) })))
  }
  const salaryIncome = summary.entries
    .filter(entry => entry.direction === 'income' && (entry.kind === 'salary' || entry.kind === 'salary_override')
      && (entry.localDate ?? toLocalDateValue(new Date(entry.occurredAt))) <= todayValue)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const breakdown = monthlyWorkBreakdown(month, normalIntervals, sessions.overtime ?? [], sessions.slacking ?? [], salaryIncome, now)
  const workedSeconds = breakdown.normalWorkedSeconds
  return {
    ...breakdown,
    income: summary.income,
    expectedIncome,
    workedSeconds,
    plannedSeconds,
    workdayCount,
    progress: plannedSeconds > 0 ? Math.min(1, Math.max(0, workedSeconds / plannedSeconds)) : 0,
  }
}
