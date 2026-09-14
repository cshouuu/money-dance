import { calculateRates, rosterForDate, type SalaryProfile } from '@salary-flow/core'
import { salaryProfileForBusinessDate } from './profile'
import { rosterStandardDayAmount } from './roster'

export function wageMilestoneAmounts(profile: SalaryProfile, date: string) {
  const dated = salaryProfileForBusinessDate(profile, date)
  const rates = calculateRates(dated)
  const roster = rosterForDate(profile, date)
  if (roster?.pay.mode === 'salary') {
    // Fixed salary still exists on rest days and before manual shifts are entered.
    const monthly = calculateRates({ ...dated, calculationHours: undefined }).daily * dated.monthlyWorkDays
    const daily = rosterStandardDayAmount(dated, date, rates.daily)
    return { daily, weekly: daily * 7, monthly }
  }
  return { daily: rates.daily, weekly: rates.daily * (dated.workWeekMode === 'alternating' ? 5.5 : dated.workDaysPerWeek), monthly: rates.daily * dated.monthlyWorkDays }
}
