import { calculateRates, rosterForDate, workProfileForDate } from '@salary-flow/core'
import { toLocalDateValue } from '../form'
import { summarizeLedger, type SummaryResult } from '../ledger'
import { getMonthlyWorkStats, type MonthlyWorkStats } from '../monthlyStats'
import { actualPaidIntervalsInRange, calculatePaidTimeEarnings } from '../paidTime'
import { salaryProfileForBusinessDate } from '../profile'
import { loadWorkspaceStore } from './store'
import { PRIMARY_SPACE_ID, templateFeatures, templateForProfile, type WorkSpace } from './model'

/** Calculate each space with its own rules before combining. Generated IDs are
 * namespaced only in the public result; single-space overrides keep their IDs. */
export function summarizeSpaces(spaces: readonly WorkSpace[], start: Date, end: Date, now = new Date(), filter = 'all'): SummaryResult {
  const entries = spaces.flatMap(space => summarizeLedger(space.profile, space.ledger, start, end, now,
    space.workRecords, space.attendanceRecords, space.holidaySettings).entries.map(entry => {
      const personal = space.id === PRIMARY_SPACE_ID && !entry.spaceId && !entry.workStageId && !['salary', 'salary_override', 'overtime'].includes(entry.kind)
      return { ...entry, id: space.id === PRIMARY_SPACE_ID || personal ? entry.id : `${space.id}:${entry.id}`,
        spaceId: personal ? null : space.id, spaceName: personal ? '公共收支' : space.name }
    })).filter(entry => filter === 'all' || (filter === 'public' ? entry.spaceId === null : entry.spaceId === filter))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const income = entries.filter(entry => entry.direction === 'income').reduce((sum, entry) => sum + entry.amount, 0)
  const expense = entries.filter(entry => entry.direction === 'expense').reduce((sum, entry) => sum + entry.amount, 0)
  return { entries, income, expense, net: income - expense }
}

export function monthlySpaceStats(spaces: readonly WorkSpace[], now = new Date()): MonthlyWorkStats {
  const stats = spaces.map(space => getMonthlyWorkStats(space.profile, space.ledger, space.workRecords, space.attendanceRecords,
    now, { overtime: space.overtime, slacking: space.slacking }, space.holidaySettings)).map((item, index) => {
      const space = spaces[index]
      // Unscheduled work has no promised future hours. Include only known work
      // in the forecast instead of inventing a full month of freelance shifts.
      const date = toLocalDateValue(now)
      const profile = workProfileForDate(space.profile, date)
      const hourly = templateFeatures(templateForProfile(space.profile, date)).hourly
      return (hourly || space.id !== PRIMARY_SPACE_ID) && profile.defaultWorkMode === 'flexible' && !rosterForDate(space.profile, date)
        ? { ...item, expectedIncome: item.income, plannedSeconds: item.workedSeconds,
            workdayCount: space.workRecords.filter(record => record.date.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)).length }
        : item
    })
  const sum = (key: keyof MonthlyWorkStats) => stats.reduce((total, item) => total + Number(item[key] ?? 0), 0)
  const total = sum('totalWorkedSeconds'); const net = sum('netWorkedSeconds'); const income = sum('workIncome'); const planned = sum('plannedSeconds')
  return { income: sum('income'), expectedIncome: sum('expectedIncome'), workedSeconds: sum('workedSeconds'), plannedSeconds: planned,
    workdayCount: sum('workdayCount'), progress: planned ? Math.min(1, sum('workedSeconds') / planned) : 0,
    normalWorkedSeconds: sum('normalWorkedSeconds'), overtimeSeconds: sum('overtimeSeconds'), totalWorkedSeconds: total,
    slackingSeconds: sum('slackingSeconds'), netWorkedSeconds: net, salaryIncome: sum('salaryIncome'), overtimeIncome: sum('overtimeIncome'),
    workIncome: income, averageHourlyIncome: total ? income / (total / 3600) : null, netHourlyIncome: net ? income / (net / 3600) : null,
    rosterEnabled: stats.some(item => item.rosterEnabled) }
}

export function additionalWishEarnings(start: Date, end: Date): number {
  return loadWorkspaceStore().spaces.reduce((sum, space) => sum + calculatePaidTimeEarnings(space.profile, start, end,
    space.workRecords, space.attendanceRecords, space.holidaySettings).earnedAmount, 0)
}

export function additionalWishSlices(start: Date, end: Date) {
  return loadWorkspaceStore().spaces.flatMap(space => actualPaidIntervalsInRange(space.profile, start, end,
    space.workRecords, space.attendanceRecords, space.holidaySettings).map(interval => ({
      startAt: interval.start.getTime(), endAt: interval.end.getTime(), ratePerSecond: calculateRates(salaryProfileForBusinessDate(
        space.profile, interval.businessDate, space.attendanceRecords, space.holidaySettings)).second,
    })))
}
