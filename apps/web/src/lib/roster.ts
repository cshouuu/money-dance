import { calculateRates, parseClock, rosterForDate, rosterShiftsForDate, vacationForDate, workProfileForDate, type SalaryProfile, type ShiftTemplate } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { chinaHolidayForDate, isHalfDayLeave, attendanceLeavePeriod, loadChinaHolidaySettings, type ChinaHolidaySettings } from './attendance'
import { localDateWithTime, toLocalDateValue } from './form'
import { shiftSessionLocalDate } from './sessionBusinessDate'

export const MAX_SHIFT_DAYS = 31
export interface RosterInterval { start: Date; end: Date; businessDate: string }
export const shiftDuration = (shift: ShiftTemplate) => shift.endDay * 86400 + parseClock(shift.endTime) - parseClock(shift.startTime)
export const shiftHours = (seconds: number) => `${Number((seconds / 3600).toFixed(2))} 小时`

export function shiftIntervals(shift: ShiftTemplate, date: string): RosterInterval[] {
  const start = localDateWithTime(date, shift.startTime)
  const duration = shiftDuration(shift)
  const rests = shift.breaks.filter(item => !item.paid).sort((a, b) => a.startMinute - b.startMinute)
  const result: RosterInterval[] = []
  let cursor = 0
  for (const rest of rests) {
    const before = Math.min(duration, rest.startMinute * 60)
    if (before > cursor) result.push({ start: new Date(+start + cursor * 1000), end: new Date(+start + before * 1000), businessDate: date })
    cursor = Math.max(cursor, Math.min(duration, rest.endMinute * 60))
  }
  if (duration > cursor) result.push({ start: new Date(+start + cursor * 1000), end: new Date(+start + duration * 1000), businessDate: date })
  return result
}

export function effectiveRosterShifts(profile: SalaryProfile, date: string, settings = loadChinaHolidaySettings()): ShiftTemplate[] {
  const plan = rosterForDate(profile, date)
  if (!plan) return []
  if (plan.overrides.some(item => item.date === date)) return rosterShiftsForDate(profile, date)
  if (plan.respectVacations && vacationForDate(profile, date)) return []
  if (plan.respectHolidays && chinaHolidayForDate(date, settings)?.kind === 'holiday') return []
  return rosterShiftsForDate(profile, date)
}

/** Explicit attendance can restore a regular shift suppressed by a holiday. */
export function attendanceRosterShifts(profile: SalaryProfile, date: string, attendance: readonly AttendanceRecord[] = [], settings = loadChinaHolidaySettings()) {
  const manual = attendance.find(item=>item.date===date)
  if (manual && (manual.status==='holiday' || (manual.status==='leave' && !isHalfDayLeave(manual)))) return []
  return manual ? rosterShiftsForDate(profile,date) : effectiveRosterShifts(profile,date,settings)
}

export function rosterStandardDayAmount(profile: SalaryProfile, date: string, fallback: number) {
  if (rosterForDate(profile,date)?.pay.mode!=='salary') return fallback
  const base={...(profile.calculationHours ? profile : workProfileForDate(profile,date)),calculationHours:undefined}
  const [year,month]=date.split('-').map(Number)
  return calculateRates(base).daily*base.monthlyWorkDays/new Date(year,month,0).getDate()
}

export function rosterIntervals(profile: SalaryProfile, date: string, attendance: readonly AttendanceRecord[] = [], settings = loadChinaHolidaySettings()): RosterInterval[] {
  const manual = attendance.find(item => item.date === date)
  if (manual && (manual.status === 'holiday' || (manual.status === 'leave' && !isHalfDayLeave(manual)))) return []
  const shifts = attendanceRosterShifts(profile, date, attendance, settings)
  const intervals = shifts.flatMap(shift => shiftIntervals(shift, date)).sort((a, b) => +a.start - +b.start)
  if (!isHalfDayLeave(manual)) return intervals
  const total = intervals.reduce((sum, item) => sum + (+item.end - +item.start), 0)
  let cursor = 0
  const first = attendanceLeavePeriod(manual) === 'afternoon'
  return intervals.flatMap(item => {
    const length = +item.end - +item.start
    const from = Math.max(0, (first ? 0 : total / 2) - cursor)
    const to = Math.min(length, (first ? total / 2 : total) - cursor)
    cursor += length
    return to > from ? [{ ...item, start: new Date(+item.start + from), end: new Date(+item.start + to) }] : []
  })
}

function merge(intervals: RosterInterval[]): RosterInterval[] {
  const result: RosterInterval[] = []
  for (const item of intervals.sort((a, b) => +a.start - +b.start)) {
    const previous = result.at(-1)
    if (previous && item.start <= previous.end) previous.end = new Date(Math.max(+previous.end, +item.end))
    else result.push({ ...item })
  }
  return result
}

/** Saved actual sessions survive changes to the future plan; unpaid breaks remain excluded. */
export function rosterActualIntervals(profile: SalaryProfile, date: string, until: Date, records: readonly DailyWorkRecord[], attendance: readonly AttendanceRecord[], settings = loadChinaHolidaySettings()): RosterInterval[] {
  const planned = rosterIntervals(profile, date, attendance, settings)
  const record = records.find(item => item.date === date)
  const manual = attendance.find(item => item.date === date)
  if (manual && (manual.status === 'holiday' || (manual.status === 'leave' && !isHalfDayLeave(manual)))) return []
  if (!record?.sessions.length) return record?.mode === 'flexible' ? [] : planned
  const shifts = rosterShiftsForDate(profile, date)
  const unpaid = shifts.flatMap(shift => shift.breaks.filter(rest => !rest.paid).map(rest => {
    const start = +localDateWithTime(date, shift.startTime)
    return { start: new Date(start + rest.startMinute * 60000), end: new Date(start + rest.endMinute * 60000), businessDate: date }
  }))
  let actual = merge(record.sessions.flatMap(session => {
    const start = new Date(session.startTime)
    const end = session.endTime ? new Date(session.endTime) : new Date(Math.min(+until, record.plannedEndTime ? +new Date(record.plannedEndTime) : +until))
    return end > start ? [{ start, end, businessDate: date }] : []
  }))
  for (const rest of unpaid) actual = actual.flatMap(item => {
    if (rest.end <= item.start || rest.start >= item.end) return [item]
    return [rest.start > item.start ? { ...item, end: rest.start } : null, rest.end < item.end ? { ...item, start: rest.end } : null].filter((item): item is RosterInterval => !!item)
  })
  if (isHalfDayLeave(manual)) actual = actual.flatMap(item => planned.flatMap(allowed => {
    const start = new Date(Math.max(+item.start, +allowed.start)); const end = new Date(Math.min(+item.end, +allowed.end))
    return end > start ? [{ ...item, start, end }] : []
  }))
  return actual
}

export const intervalSeconds = (items: RosterInterval[], until = new Date(8640000000000000)) => items.reduce((sum, item) => sum + Math.max(0, Math.min(+until, +item.end) - +item.start) / 1000, 0)

const monthCache = new WeakMap<NonNullable<SalaryProfile['rosters']>, Map<string, { seconds:number; amount:number }>>()

export function rosterRateHours(profile: SalaryProfile, date: string) {
  const plan = rosterForDate(profile, date)
  if (!plan) return undefined
  const day = intervalSeconds(rosterShiftsForDate(profile, date).flatMap(shift => shiftIntervals(shift, date))) / 3600
  const [year, month] = date.split('-').map(Number)
  const start = new Date(year, month - 1, 1); const end = new Date(year, month, 1)
  const cacheKey = `${date.slice(0,7)}:${plan.stageId ?? ''}:${plan.pay.mode}`
  const cache = monthCache.get(profile.rosters!) ?? new Map<string,{seconds:number;amount:number}>()
  let aggregate = cache.get(cacheKey)
  if (!aggregate) {
  let seconds = 0; let amount = 0
  for (let key = shiftSessionLocalDate(toLocalDateValue(start), -MAX_SHIFT_DAYS); key < toLocalDateValue(end); key = shiftSessionLocalDate(key, 1)) {
    const owner = rosterForDate(profile,key)
    if(owner?.stageId !== plan.stageId || owner.pay.mode !== plan.pay.mode) continue
    for (const shift of rosterShiftsForDate(profile, key)) {
      const parts = shiftIntervals(shift,key)
      const total = intervalSeconds(parts)
      const overlap = parts.reduce((sum,interval)=>sum+Math.max(0, Math.min(+end,+interval.end)-Math.max(+start,+interval.start))/1000,0)
      seconds += overlap; amount += total > 0 ? shift.amount * overlap / total : 0
    }
  }
  aggregate = {seconds,amount}; cache.set(cacheKey,aggregate); monthCache.set(profile.rosters!,cache)
  }
  const hourly = plan.pay.mode === 'hourly' ? plan.pay.value : plan.pay.mode === 'shift' ? day > 0 ? rosterShiftsForDate(profile,date).reduce((sum,shift)=>sum+shift.amount,0)/day : aggregate.seconds>0 ? aggregate.amount/(aggregate.seconds/3600) : 0 : undefined
  let monthlyAmount: number | undefined
  if(plan.pay.mode==='salary' && plan.pay.monthlyHours===0) {
    let salaryDays = 0
    for(let key=toLocalDateValue(start); key<toLocalDateValue(end); key=shiftSessionLocalDate(key,1)) {
      const owner = rosterForDate(profile,key)
      if(owner?.stageId===plan.stageId && owner.pay.mode==='salary') salaryDays++
    }
    const base={...profile,calculationHours:undefined}
    monthlyAmount=calculateRates(base).daily*base.monthlyWorkDays*salaryDays/new Date(year,month,0).getDate()
  }
  return { day, ...(monthlyAmount===undefined?{}:{monthlyAmount}), month: plan.pay.monthlyHours > 0 ? plan.pay.monthlyHours : aggregate.seconds / 3600, ...(hourly === undefined ? {} : {hourly}) }
}

/** Salary belongs to calendar dates; per-shift income belongs to its start date. */
export function rosterPayForDate(profile: SalaryProfile, date: string, now: Date, records: readonly DailyWorkRecord[] = [], attendance: readonly AttendanceRecord[] = [], settings: ChinaHolidaySettings = loadChinaHolidaySettings()): number | null {
  const plan = rosterForDate(profile, date)
  if (!plan) return null
  const override = plan.overrides.find(item => item.date === date)
  if (override?.amount !== undefined) return override.amount
  const dated = profile.calculationHours ? profile : workProfileForDate(profile, date)
  const base = { ...dated, calculationHours: undefined }
  const [year, month] = date.split('-').map(Number)
  const days = new Date(year, month, 0).getDate()
  const shifts = attendanceRosterShifts(profile, date, attendance, settings)
  const actual = rosterActualIntervals(profile, date, now, records, attendance, settings)
  const planned = rosterIntervals(profile, date, attendance, settings)
  const actualSeconds = intervalSeconds(actual, now)
  const plannedSeconds = intervalSeconds(planned)
  const second = calculateRates({ ...base, calculationHours: rosterRateHours(profile, date) }).second
  let amount = plan.pay.mode === 'salary' ? calculateRates(base).daily * base.monthlyWorkDays / days : 0
  if (plan.pay.mode === 'hourly') amount = (plan.pay.basis === 'planned' ? intervalSeconds(planned, now) : Math.min(actualSeconds, plannedSeconds || actualSeconds)) * plan.pay.value / 3600
  for (const shift of shifts) {
    const parts = shiftIntervals(shift, date)
    const shiftEnd = new Date(+localDateWithTime(date, shift.startTime) + shiftDuration(shift) * 1000)
    const credited = plan.pay.basis === 'planned' ? now >= shiftEnd : parts.every(part => intervalSeconds(actual.flatMap(item => {
      const start = new Date(Math.max(+part.start, +item.start)); const end = new Date(Math.min(+part.end, +item.end))
      return end > start ? [{ start, end, businessDate: date }] : []
    }), now) >= (+part.end - +part.start) / 1000)
    if (credited) amount += shift.allowance + (plan.pay.mode === 'shift' ? shift.amount : 0)
  }
  const excess = Math.max(0, actualSeconds - plannedSeconds)
  const record = records.find(item => item.date === date)
  // Explicit overtime settlement is recorded separately in the ledger.
  if (!record?.overtimeSessionId || record.settlementMode !== 'full-day' || record.settlementPending) {
    if (plan.pay.overtime === 'multiplier') amount += excess * second * plan.pay.overtimeValue
    if (plan.pay.overtime === 'fixed' && excess > 0 && record?.status === 'ended') amount += plan.pay.overtimeValue
  }
  return Math.max(0, amount)
}

export function rosterBusinessDate(profile: SalaryProfile, now: Date, settings = loadChinaHolidaySettings()): string | null {
  const today = toLocalDateValue(now)
  for (let offset = MAX_SHIFT_DAYS; offset >= 0; offset--) {
    const date = shiftSessionLocalDate(today, -offset)
    for (const shift of effectiveRosterShifts(profile, date, settings)) {
      const start = localDateWithTime(date, shift.startTime)
      if (start <= now && +now < +start + shiftDuration(shift) * 1000) return date
    }
  }
  return rosterForDate(profile, today) ? today : null
}

export function rosterDayLabel(profile: SalaryProfile, date: string, settings = loadChinaHolidaySettings()): string | null {
  if (!profile.rosters?.length) return null
  const names = effectiveRosterShifts(profile,date,settings).map(shift=>shift.name)
  for (const item of continuedRosterShifts(profile,date,settings)) names.push(`${item.shift.name}·续`)
  return names.length ? names.join(' / ') : rosterForDate(profile,date) ? '排班休息' : null
}

/** Whole-shift changes and settlement are always attached to the opening date. */
export function continuedRosterShifts(profile: SalaryProfile, date: string, settings = loadChinaHolidaySettings()) {
  if (!profile.rosters?.length) return []
  const result: { businessDate: string; shift: ShiftTemplate }[] = []
  const start = +localDateWithTime(date,'00:00')
  for (let offset=1; offset<=MAX_SHIFT_DAYS; offset++) {
    const before=shiftSessionLocalDate(date,-offset)
    for(const shift of effectiveRosterShifts(profile,before,settings)) {
      if(+localDateWithTime(before,shift.startTime)+shiftDuration(shift)*1000>start) result.push({businessDate:before,shift})
    }
  }
  return result
}
