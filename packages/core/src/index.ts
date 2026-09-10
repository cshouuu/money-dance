export type SalaryType = 'monthly' | 'annual' | 'daily' | 'hourly'
export type SalaryHistoryMode = 'none' | 'custom'
export type WorkMode = 'scheduled' | 'flexible'
export type WorkWeekMode = 'fixed' | 'alternating'
export type AlternatingWeekType = 'big' | 'small'
export type LivingCostMode = 'deduct' | 'daily-ledger'
export type LivingCostHistoryMode = 'off' | LivingCostMode
export type MonthlyRateBasis = 'average' | 'actual-calendar'
export type PaydayAdjustment = 'none' | 'previous-workday' | 'next-workday'
export type SalaryDeductionType = 'fixed' | 'percentage'

export interface SalaryDeduction {
  id: string
  name: string
  type: SalaryDeductionType
  /** Fixed monthly amount, or a percentage of gross salary. */
  value: number
  enabled: boolean
}

export interface LivingCostHistoryEvent {
  version: 1
  effectiveFrom: string
  mode: LivingCostHistoryMode
  monthlyAmount: number
}

export interface BreakPeriod {
  id: string
  name: string
  startTime: string
  endTime: string
}

export interface SalaryProfile {
  /** Opt-in work history; absent preserves the legacy single-job behavior. */
  workJourney?: WorkJourney
  salary: number
  salaryType: SalaryType
  /** Calendar day of month used for the payday countdown. */
  payday: number | null
  /** How a non-working nominal payday is moved. */
  paydayAdjustment: PaydayAdjustment
  workStartTime: string
  workEndTime: string
  breakStartTime: string
  breakEndTime: string
  paidBreak: boolean
  /** Undefined uses legacy lunch fields; an empty list means no scheduled breaks. */
  breakPeriods?: BreakPeriod[]
  includeLivingCost: boolean
  monthlyLivingCost: number
  livingCostMode: LivingCostMode
  livingCostHistory: LivingCostHistoryEvent[]
  /** Payroll deductions applied before deriving take-home time rates. */
  salaryDeductions: SalaryDeduction[]
  /** Average conversion or the current calendar month's paid-day count. */
  monthlyRateBasis: MonthlyRateBasis
  monthlyWorkDays: number
  workDaysPerWeek: number
  workWeekMode: WorkWeekMode
  alternatingAnchorDate: string
  alternatingAnchorType: AlternatingWeekType
  currency: string
  salaryHistoryMode: SalaryHistoryMode
  salaryEffectiveDate: string
  defaultWorkMode: WorkMode
}

export interface WorkStage {
  id: string
  name: string
  company: string
  role: string
  startDate: string
  /** Inclusive business date, including the final overnight shift. */
  endDate: string | null
  /** Unknown historical salary must never be inferred from the current job. */
  profile: Omit<SalaryProfile, 'workJourney'> | null
  createdAt: string
}

export interface WorkJourney {
  version: 1
  revision: number
  stages: WorkStage[]
}

export function workStageForDate(profile: SalaryProfile, date: string): WorkStage | undefined {
  return profile.workJourney?.stages.find(stage => stage.startDate <= date && (!stage.endDate || date <= stage.endDate))
}

export function isEmployedOn(profile: SalaryProfile, date: string): boolean {
  return !profile.workJourney || !!workStageForDate(profile, date)
}

/** Select schedules as well as salaries. Keep the timeline for downstream date guards. */
export function workProfileForDate(profile: SalaryProfile, date: string): SalaryProfile {
  if (!profile.workJourney) return profile
  const stage = workStageForDate(profile, date)
  if (!stage?.profile) return { ...profile, salary: 0, payday: null, salaryDeductions: [], includeLivingCost: false }
  // Each stage owns its rules, including an active job with a planned end date.
  return { ...stage.profile, workJourney: profile.workJourney }
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
  payday: null,
  paydayAdjustment: 'previous-workday',
  workStartTime: '09:00',
  workEndTime: '18:00',
  breakStartTime: '12:00',
  breakEndTime: '13:00',
  paidBreak: false,
  includeLivingCost: false,
  monthlyLivingCost: 0,
  livingCostMode: 'deduct',
  livingCostHistory: [],
  salaryDeductions: [],
  monthlyRateBasis: 'actual-calendar',
  monthlyWorkDays: 21.75,
  workDaysPerWeek: 5,
  workWeekMode: 'fixed',
  alternatingAnchorDate: '1970-01-05',
  alternatingAnchorType: 'big',
  currency: 'CNY',
  salaryHistoryMode: 'none',
  salaryEffectiveDate: '',
  defaultWorkMode: 'scheduled',
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

export function getBreakPeriods(profile: SalaryProfile): BreakPeriod[] {
  return profile.breakPeriods ?? [{ id: 'legacy-lunch', name: '午休', startTime: profile.breakStartTime, endTime: profile.breakEndTime }]
}

/** Named breaks clipped to the shift, including breaks spanning midnight or shift start. */
export function getShiftBreaks(profile: SalaryProfile): Array<BreakPeriod & { start: number; end: number }> {
  const shiftStart = parseClock(profile.workStartTime)
  const shift = duration(shiftStart, parseClock(profile.workEndTime))
  return getBreakPeriods(profile).flatMap(period => {
    const clock = parseClock(period.startTime)
    const length = duration(clock, parseClock(period.endTime))
    const offset = positionFromShiftStart(clock, shiftStart)
    return [offset - DAY, offset].flatMap(position => {
      const start = Math.max(0, position)
      const end = Math.min(shift, position + length)
      return end > start ? [{ ...period, start, end }] : []
    })
  }).sort((a, b) => a.start - b.start || a.end - b.end)
}

/** Union of unpaid breaks so overlapping periods are deducted once. */
export function getUnpaidBreakOffsets(profile: SalaryProfile): Array<{ start: number; end: number }> {
  if (profile.paidBreak) return []
  const merged: Array<{ start: number; end: number }> = []
  for (const period of getShiftBreaks(profile)) {
    const previous = merged.at(-1)
    if (previous && period.start <= previous.end) previous.end = Math.max(previous.end, period.end)
    else merged.push({ start: period.start, end: period.end })
  }
  return merged
}

export function getPaidSecondsPerDay(profile: SalaryProfile): number {
  const shift = duration(parseClock(profile.workStartTime), parseClock(profile.workEndTime))
  return Math.max(0, shift - getUnpaidBreakOffsets(profile).reduce((total, period) => total + period.end - period.start, 0))
}

/** Gross monthly equivalent for every supported salary input mode. */
export function calculateGrossMonthlySalary(profile: SalaryProfile): number {
  if (!Number.isFinite(profile.salary) || profile.salary < 0) throw new Error('Salary must be non-negative')
  if (!Number.isFinite(profile.monthlyWorkDays) || profile.monthlyWorkDays <= 0) throw new Error('Monthly work days must be positive')
  const paidSecondsPerDay = getPaidSecondsPerDay(profile)
  if (paidSecondsPerDay <= 0) throw new Error('Paid work duration must be positive')
  if (profile.salaryType === 'annual') return profile.salary / 12
  if (profile.salaryType === 'monthly') return profile.salary
  if (profile.salaryType === 'daily') return profile.salary * profile.monthlyWorkDays
  return profile.salary * (paidSecondsPerDay / 3600) * profile.monthlyWorkDays
}

/** Monthly payroll deductions after fixed and percentage items are combined. */
export function calculateMonthlySalaryDeductions(profile: SalaryProfile): number {
  const grossMonthly = calculateGrossMonthlySalary(profile)
  return (profile.salaryDeductions ?? []).reduce((total, deduction) => {
    if (!deduction?.enabled || !Number.isFinite(deduction.value) || deduction.value <= 0) return total
    if (deduction.type === 'percentage') return total + grossMonthly * Math.min(100, deduction.value) / 100
    if (deduction.type === 'fixed') return total + deduction.value
    return total
  }, 0)
}

export function calculateRates(profile: SalaryProfile): SalaryRates {
  if (!Number.isFinite(profile.salary) || profile.salary < 0) throw new Error('Salary must be non-negative')
  if (!Number.isFinite(profile.monthlyWorkDays) || profile.monthlyWorkDays <= 0) throw new Error('Monthly work days must be positive')
  // Legacy profiles do not have livingCostMode. Treating a missing value as
  // "deduct" preserves the original disposable-rate calculation.
  const deductLivingCost = profile.includeLivingCost && profile.livingCostMode !== 'daily-ledger'
  const configuredLivingCost = profile.includeLivingCost ? profile.monthlyLivingCost ?? 0 : 0
  if (!Number.isFinite(configuredLivingCost) || configuredLivingCost < 0) throw new Error('Living cost must be non-negative')
  const monthlyLivingCost = deductLivingCost ? configuredLivingCost : 0

  const paidSecondsPerDay = getPaidSecondsPerDay(profile)
  if (paidSecondsPerDay <= 0) throw new Error('Paid work duration must be positive')

  const livingCostPerWorkDay = monthlyLivingCost / profile.monthlyWorkDays
  const salaryDeductionPerWorkDay = calculateMonthlySalaryDeductions(profile) / profile.monthlyWorkDays
  let grossDaily: number
  if (profile.salaryType === 'annual') grossDaily = (profile.salary / 12) / profile.monthlyWorkDays
  else if (profile.salaryType === 'monthly') grossDaily = profile.salary / profile.monthlyWorkDays
  else if (profile.salaryType === 'daily') grossDaily = profile.salary
  else grossDaily = profile.salary * (paidSecondsPerDay / 3600)

  const daily = Math.max(0, grossDaily - salaryDeductionPerWorkDay - livingCostPerWorkDay)
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

  const unpaidElapsed = getUnpaidBreakOffsets(profile).reduce((total, period) => total + Math.max(0, Math.min(elapsed, period.end) - period.start), 0)
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
