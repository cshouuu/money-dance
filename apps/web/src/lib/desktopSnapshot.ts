import { calculateRates, isEmployedOn, type SalaryProfile } from '@salary-flow/core'
import type { ActiveOvertime, ActiveSlacking, AttendanceRecord, DailyWorkRecord } from '../types'
import { actualPaidIntervalsInRange } from './paidTime'
import { calculateOvertimeEarnings } from './overtime'
import { salaryProfileForBusinessDate } from './profile'
import { sessionStartLocalDate } from './sessionBusinessDate'
import { summarizeTodayWork } from './work'
import type { PetSnapshot } from './desktop'

export function buildDesktopSnapshot(profile: SalaryProfile, records: DailyWorkRecord[], attendance: AttendanceRecord[],
  activeSlacking: ActiveSlacking | null, activeOvertime: ActiveOvertime | null, now = new Date()): PetSnapshot {
  const work = summarizeTodayWork(profile, records, now, undefined, attendance)
  const validStart = (time: string | undefined) => !!time && Number.isFinite(Date.parse(time)) && Date.parse(time) <= now.getTime()
  const overtime = activeOvertime && validStart(activeOvertime.startTime) ? activeOvertime : null
  const overtimeSeconds = overtime ? Math.max(0, (now.getTime() - Date.parse(overtime.startTime)) / 1000) : 0
  const overtimeDate = overtime ? sessionStartLocalDate(overtime) : work.businessDate
  const overtimeRate = calculateRates(salaryProfileForBusinessDate(profile, overtimeDate, attendance)).second
  const working = isEmployedOn(profile, work.businessDate) && work.status === 'working'
    && actualPaidIntervalsInRange(profile, now, new Date(now.getTime() + 1000), records, attendance).length > 0
  return {
    updatedAt: now.getTime(), businessDate: work.businessDate, workAmount: work.earnedAmount,
    overtimeAmount: overtime ? calculateOvertimeEarnings(overtime, overtimeSeconds, overtimeRate) : 0,
    overtimeSeconds, overtimeId: overtime?.startTime ?? '',
    state: overtime ? 'overtime' : validStart(activeSlacking?.startTime) ? 'slacking' : working ? 'working' : 'rest',
    wish: null,
  }
}
