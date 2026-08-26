export type SalaryType = 'monthly' | 'annual' | 'daily' | 'hourly'

export interface SalaryProfile {
  salary: number
  salaryType: SalaryType
  workStartTime: string
  workEndTime: string
  breakStartTime: string
  breakEndTime: string
  paidBreak: boolean
  includeLivingCost: boolean
  monthlyLivingCost: number
  monthlyWorkDays: number
  workDaysPerWeek: number
  currency: string
}

export interface SalaryRates {
  daily: number
  hourly: number
  minute: number
  second: number
  paidSecondsPerDay: number
}

export const DEFAULT_PROFILE: SalaryProfile = {
  salary: 15000,
  salaryType: 'monthly',
  workStartTime: '09:00',
  workEndTime: '18:00',
  breakStartTime: '12:00',
  breakEndTime: '13:00',
  paidBreak: false,
  includeLivingCost: false,
  monthlyLivingCost: 0,
  monthlyWorkDays: 21.75,
  workDaysPerWeek: 5,
  currency: 'CNY',
}

const DAY = 24 * 60 * 60

export function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Invalid time format')
  const h = Number(match[1]); const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error('Invalid clock time')
  return h * 3600 + m * 60
}

function duration(start: number, end: number): number {
  return end >= start ? end - start : DAY - start + end
}

function positionFromShiftStart(clock: number, shiftStart: number): number {
  return clock >= shiftStart ? clock - shiftStart : DAY - shiftStart + clock
}

export function getPaidSecondsPerDay(profile: SalaryProfile): number {
  const start = parseClock(profile.workStartTime)
  const end = parseClock(profile.workEndTime)
  const shift = duration(start, end)
  if (shift <= 0) return 0
  if (profile.paidBreak) return shift

  const breakStartClock = parseClock(profile.breakStartTime)
  const breakEndClock = parseClock(profile.breakEndTime)
  const breakStart = positionFromShiftStart(breakStartClock, start)
  const breakDuration = duration(breakStartClock, breakEndClock)
  const breakEnd = breakStart + breakDuration
  const overlap = Math.max(0, Math.min(shift, breakEnd) - Math.max(0, breakStart))
  return Math.max(0, shift - overlap)
}

export function calculateRates(profile: SalaryProfile): SalaryRates {
  if (!Number.isFinite(profile.salary) || profile.salary < 0) throw new Error('Salary must be non-negative')
  if (!Number.isFinite(profile.monthlyWorkDays) || profile.monthlyWorkDays <= 0) throw new Error('Monthly work days must be positive')
  const monthlyLivingCost = profile.includeLivingCost ? profile.monthlyLivingCost ?? 0 : 0
  if (!Number.isFinite(monthlyLivingCost) || monthlyLivingCost < 0) throw new Error('Living cost must be non-negative')

  const paidSecondsPerDay = getPaidSecondsPerDay(profile)
  if (paidSecondsPerDay <= 0) throw new Error('Paid work duration must be positive')

  const livingCostPerWorkDay = monthlyLivingCost / profile.monthlyWorkDays
  let grossDaily: number
  if (profile.salaryType === 'annual') grossDaily = (profile.salary / 12) / profile.monthlyWorkDays
  else if (profile.salaryType === 'monthly') grossDaily = profile.salary / profile.monthlyWorkDays
  else if (profile.salaryType === 'daily') grossDaily = profile.salary
  else grossDaily = profile.salary * (paidSecondsPerDay / 3600)

  const daily = Math.max(0, grossDaily - livingCostPerWorkDay)
  const second = daily / paidSecondsPerDay
  return { daily, hourly: second * 3600, minute: second * 60, second, paidSecondsPerDay }
}

function secondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000
}

export function getWorkedPaidSeconds(profile: SalaryProfile, now = new Date()): number {
  const shiftStartClock = parseClock(profile.workStartTime)
  const shiftEndClock = parseClock(profile.workEndTime)
  const shiftDuration = duration(shiftStartClock, shiftEndClock)
  const nowClock = secondsSinceMidnight(now)
  const nowPos = positionFromShiftStart(nowClock, shiftStartClock)

  const crossesMidnight = shiftEndClock < shiftStartClock
  const beforeStart = !crossesMidnight && nowClock < shiftStartClock
  const afterEnd = !crossesMidnight && nowClock >= shiftEndClock
  const inPreviousCalendarPart = crossesMidnight && nowClock < shiftEndClock
  const inShift = crossesMidnight ? (nowClock >= shiftStartClock || inPreviousCalendarPart) : (!beforeStart && !afterEnd)

  if (!inShift) {
    if (afterEnd || (crossesMidnight && nowClock >= shiftEndClock && nowClock < shiftStartClock)) return getPaidSecondsPerDay(profile)
    return 0
  }

  const elapsed = Math.min(nowPos, shiftDuration)
  if (profile.paidBreak) return elapsed

  const breakStartClock = parseClock(profile.breakStartTime)
  const breakEndClock = parseClock(profile.breakEndTime)
  const breakStart = positionFromShiftStart(breakStartClock, shiftStartClock)
  const breakDuration = duration(breakStartClock, breakEndClock)
  const breakEnd = breakStart + breakDuration
  const unpaidElapsed = Math.max(0, Math.min(elapsed, breakEnd) - Math.max(0, breakStart))
  return Math.max(0, Math.min(getPaidSecondsPerDay(profile), elapsed - unpaidElapsed))
}

export function calculateEarnedToday(profile: SalaryProfile, now = new Date()): number {
  return getWorkedPaidSeconds(profile, now) * calculateRates(profile).second
}

export function priceToWorkSeconds(price: number, secondRate: number): number {
  if (!Number.isFinite(price) || price < 0) throw new Error('Price must be non-negative')
  if (!Number.isFinite(secondRate) || secondRate <= 0) return Number.POSITIVE_INFINITY
  return price / secondRate
}

export function assetCostPerHour(price: number, purchaseDate: string | Date, now = new Date()): number {
  if (!Number.isFinite(price) || price < 0) throw new Error('Price must be non-negative')
  const purchase = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate)
  const elapsedHours = (now.getTime() - purchase.getTime()) / 3_600_000
  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) return Number.POSITIVE_INFINITY
  return price / elapsedHours
}

export function slackingEarned(start: string | Date, end: string | Date, secondRate: number): number {
  const s = start instanceof Date ? start : new Date(start)
  const e = end instanceof Date ? end : new Date(end)
  const seconds = Math.max(0, (e.getTime() - s.getTime()) / 1000)
  return seconds * Math.max(0, secondRate)
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '∞'
  const s = Math.max(0, Math.round(totalSeconds))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const parts: string[] = []
  if (days) parts.push(`${days}天`)
  if (hours) parts.push(`${hours}小时`)
  if (minutes) parts.push(`${minutes}分钟`)
  if (!days && !hours && seconds) parts.push(`${seconds}秒`)
  return parts.join('') || '0秒'
}
