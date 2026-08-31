import { calculateEarnedToday, calculateRates, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, LedgerDirection, LedgerEntry, LedgerKind } from '../types'
import { attendancePayModeLabel, attendanceStatusLabel, chinaHolidayForDate, getCustomAttendanceAmount, getOfficialHolidayPayAmount, isConfiguredWorkday, loadAttendanceRecords, loadChinaHolidaySettings } from './attendance'
import { toLocalDateTime, toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'
import { loadOvertimeSessions, migrateLegacyOvertimeLedgerDates } from './overtime'
import { livingCostConfigurationBeforeDate, livingCostConfigurationForDate, normalizeLivingCostHistory, salaryProfileForBusinessDate } from './profile'
import { getFlexibleEarnedAmount, isFlexibleFullDaySettlement, loadWorkRecords } from './work'

export type SummaryDimension = 'day' | 'month' | 'year'

export interface SummaryEntry {
  id: string
  direction: LedgerDirection
  amount: number
  source: string
  category: string
  occurredAt: string
  /** Stable local business date for generated and date-based entries. */
  localDate?: string
  kind: LedgerKind | 'salary' | 'living_cost'
  generated?: boolean
  ledgerEntryId?: string
  replacesId?: string
}

export interface SummaryResult {
  income: number
  expense: number
  net: number
  entries: SummaryEntry[]
}

export function loadLedger(): LedgerEntry[] {
  const entries = loadJSON<LedgerEntry[]>(keys.ledger, [])
  const overtimeMigrated = migrateLegacyOvertimeLedgerDates(entries, loadOvertimeSessions())
  const migrated = migrateLegacySalaryOverrideLocalDates(overtimeMigrated)
  if (migrated !== entries) saveLedger(migrated)
  return migrated
}

export function saveLedger(entries: LedgerEntry[]): boolean {
  return saveJSON(keys.ledger, entries)
}

export function appendLedgerEntry(entry: LedgerEntry): LedgerEntry[] {
  const next = [entry, ...loadLedger()]
  saveLedger(next)
  return next
}

export function localDateAtNoon(value: string): Date {
  return toLocalDateTime(value)
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const SALARY_ENTRY_ID_PATTERN = /^salary-(\d{4})-(\d{1,2})-(\d{1,2})$/

function validLocalDate(value: string | undefined): value is string {
  if (!value || !LOCAL_DATE_PATTERN.test(value)) return false
  const parsed = localDateAtNoon(value)
  return !Number.isNaN(parsed.getTime()) && toLocalDateValue(parsed) === value
}

export function salaryLocalDateFromEntryId(value: string | undefined): string | undefined {
  const match = value ? SALARY_ENTRY_ID_PATTERN.exec(value) : null
  if (!match) return undefined
  const candidate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return validLocalDate(candidate) ? candidate : undefined
}

export function ledgerEntryLocalDate(entry: Pick<LedgerEntry, 'kind' | 'localDate' | 'replacesId'>): string | undefined {
  if (validLocalDate(entry.localDate)) return entry.localDate
  return entry.kind === 'salary_override' ? salaryLocalDateFromEntryId(entry.replacesId) : undefined
}

/** Adds a stable business date to old salary overrides without changing the
 * original timestamp, which may already reflect the device's former zone. */
export function migrateLegacySalaryOverrideLocalDates(entries: LedgerEntry[]): LedgerEntry[] {
  let changed = false
  const migrated = entries.map(entry => {
    if (entry.kind !== 'salary_override' || validLocalDate(entry.localDate)) return entry
    const localDate = salaryLocalDateFromEntryId(entry.replacesId)
    if (!localDate) return entry
    changed = true
    return { ...entry, localDate }
  })
  return changed ? migrated : entries
}

export function summaryEntryDateValue(entry: Pick<SummaryEntry, 'localDate' | 'occurredAt'>): string {
  if (validLocalDate(entry.localDate)) return entry.localDate
  const occurredAt = new Date(entry.occurredAt)
  return Number.isNaN(occurredAt.getTime()) ? '' : toLocalDateValue(occurredAt)
}

/** Generated salary overrides stay on the salary's own business date. */
export function salaryOverrideLocalDate(entry: Pick<SummaryEntry, 'id' | 'localDate' | 'occurredAt'>): string {
  return salaryLocalDateFromEntryId(entry.id) ?? summaryEntryDateValue(entry)
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function getSummaryRange(dimension: SummaryDimension, anchor: string): { start: Date; end: Date } {
  if (dimension === 'day') {
    const start = localDateAtNoon(anchor)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }

  if (dimension === 'month') {
    const [year, month] = anchor.split('-').map(Number)
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
  }

  const year = Number(anchor)
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) }
}

function getSalaryEffectiveDate(profile: SalaryProfile, now: Date): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.salaryEffectiveDate)) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    return today
  }
  const effectiveDate = localDateAtNoon(profile.salaryEffectiveDate)
  effectiveDate.setHours(0, 0, 0, 0)
  return Number.isNaN(effectiveDate.getTime()) ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : effectiveDate
}

export function salaryEntryIdForDate(value: string | Date): string {
  const date = typeof value === 'string' ? localDateAtNoon(value) : value
  return `salary-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function livingCostEntryIdForDate(value: string | Date): string {
  const date = typeof value === 'string' ? localDateAtNoon(value) : value
  return `living-cost-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * Splits a monthly amount using integer cents. Any remainder is assigned one
 * cent at a time from the beginning of the month, so every full month adds up
 * exactly to the configured value (for example, 1000 / 31 never loses cents).
 */
export function livingCostAmountForDate(monthlyAmount: number, date: Date): number {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return 0
  const totalCents = Math.round(monthlyAmount * 100)
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const baseCents = Math.floor(totalCents / daysInMonth)
  const remainder = totalCents % daysInMonth
  return (baseCents + (date.getDate() <= remainder ? 1 : 0)) / 100
}

function livingCostSummaryEntries(profile: SalaryProfile, start: Date, end: Date, now: Date, suppressedDates = new Set<string>()): SummaryEntry[] {
  const history = normalizeLivingCostHistory(profile.livingCostHistory)
  if (history.length === 0) return []

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const entries: SummaryEntry[] = []

  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor)
    day.setHours(0, 0, 0, 0)
    if (day > today) break
    const date = toLocalDateValue(day)
    let configuration: (typeof history)[number] | undefined
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].effectiveFrom <= date) {
        configuration = history[index]
        break
      }
    }
    if (!configuration || configuration.mode !== 'daily-ledger' || suppressedDates.has(date)) continue
    const amount = livingCostAmountForDate(configuration.monthlyAmount, day)
    if (amount <= 0) continue
    entries.push({
      id: livingCostEntryIdForDate(day),
      direction: 'expense',
      amount,
      source: '固定生活成本',
      category: '生活成本',
      occurredAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString(),
      localDate: date,
      kind: 'living_cost',
      generated: true,
    })
  }

  return entries
}

function salarySummaryEntries(profile: SalaryProfile, start: Date, end: Date, now: Date, workRecords: DailyWorkRecord[], attendanceRecords: AttendanceRecord[]): SummaryEntry[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const effectiveDate = getSalaryEffectiveDate(profile, now)
  const entries: SummaryEntry[] = []
  const workRecordByDate = new Map(workRecords.map(record => [record.date, record]))
  const attendanceByDate = new Map(attendanceRecords.map(record => [record.date, record]))
  const holidaySettings = loadChinaHolidaySettings(now)

  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor)
    day.setHours(0, 0, 0, 0)
    if (day > today) break
    const date = toLocalDateValue(day)
    const datedProfile = salaryProfileForBusinessDate(profile, date)
    const rates = calculateRates(datedProfile)
    const workRecord = workRecordByDate.get(date)
    const attendance = attendanceByDate.get(date)
    // The effective date only limits automatically generated history. A saved
    // attendance adjustment is an explicit instruction and must still be
    // reflected in the ledger, even when it predates the salary history range.
    if (day < effectiveDate && !attendance) continue
    let amount = 0
    let source = '工资收入'
    const customAttendanceAmount = getCustomAttendanceAmount(attendance, rates.daily)
    const officialHolidayAmount = attendance || workRecord ? null : getOfficialHolidayPayAmount(date, datedProfile, rates.daily, holidaySettings)
    if (attendance?.status === 'leave' || attendance?.status === 'holiday') {
      source = `工资收入 · ${attendanceStatusLabel(attendance)}`
      amount = customAttendanceAmount ?? 0
    } else if (attendance?.status === 'normal' && customAttendanceAmount !== null) {
      amount = customAttendanceAmount
      source = `工资收入 · 正常出勤 · ${attendancePayModeLabel(attendance)}`
    } else if (officialHolidayAmount !== null) {
      const holiday = chinaHolidayForDate(date, holidaySettings)
      amount = officialHolidayAmount
      source = `工资收入 · ${holiday?.name ?? '节假日'} · ${holiday?.statutory ? '法定假日' : '休息日'}`
    } else {
      const workMode = workRecord?.mode ?? datedProfile.defaultWorkMode
      if (workMode === 'flexible') {
        if (workRecord) {
          amount = getFlexibleEarnedAmount(workRecord, rates, datedProfile.salaryType, now)
          if (isFlexibleFullDaySettlement(workRecord, datedProfile.salaryType)) source = '工资收入 · 正常出勤'
        }
        else if (attendance?.status === 'normal' && !sameCalendarDay(day, today)) amount = rates.daily
      } else {
        if (!workRecord && attendance?.status !== 'normal' && !isConfiguredWorkday(day, datedProfile, holidaySettings)) continue
        amount = sameCalendarDay(day, today) ? calculateEarnedToday(datedProfile, now) : rates.daily
      }
    }
    if (amount <= 0) continue
    const id = salaryEntryIdForDate(day)
    entries.push({
      id,
      direction: 'income',
      amount,
      source,
      category: '薪资',
      occurredAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString(),
      localDate: date,
      kind: 'salary',
      generated: true,
    })
  }

  return entries
}

/**
 * Old salary overrides did not record whether their amount was gross or had
 * living costs deducted. A missing basis on the daily-ledger transition date
 * inherits the explicitly preserved pre-transition deduct configuration.
 */
export function salaryOverrideDeductsLivingCost(profile: SalaryProfile, entry: LedgerEntry): boolean {
  if (typeof entry.livingCostDeducted === 'boolean') return entry.livingCostDeducted
  const date = salaryLocalDateFromEntryId(entry.replacesId) ?? ledgerEntryLocalDate(entry)
  if (!date) return false
  const configuration = livingCostConfigurationForDate(profile, date)
  if (configuration.mode === 'deduct') return true
  if (configuration.mode !== 'daily-ledger') return false
  return livingCostConfigurationBeforeDate(profile, date)?.mode === 'deduct'
}

function livingCostSuppressedDates(profile: SalaryProfile, overrides: LedgerEntry[]): Set<string> {
  const dates = new Set<string>()
  for (const entry of overrides) {
    if (entry.deleted || !salaryOverrideDeductsLivingCost(profile, entry)) continue
    const date = salaryLocalDateFromEntryId(entry.replacesId) ?? ledgerEntryLocalDate(entry)
    if (date && livingCostConfigurationForDate(profile, date).mode === 'daily-ledger') dates.add(date)
  }
  return dates
}

function categoryFor(entry: LedgerEntry): string {
  if (entry.kind === 'purchase') return '购买'
  if (entry.kind === 'overtime') return '加班收入'
  if (entry.kind === 'manual') return '手工录入'
  if (entry.kind === 'salary_override') return '薪资调整'
  return entry.direction === 'income' ? '意外收入' : '意外花费'
}

function isInRange(entry: LedgerEntry, start: Date, end: Date): boolean {
  const localDate = ledgerEntryLocalDate(entry)
  if (localDate) {
    const businessDay = localDateAtNoon(localDate)
    return businessDay >= start && businessDay < end
  }
  const occurredAt = new Date(entry.occurredAt)
  return !Number.isNaN(occurredAt.getTime()) && occurredAt >= start && occurredAt < end
}

export function summarizeLedger(profile: SalaryProfile, ledger: LedgerEntry[], start: Date, end: Date, now = new Date(), workRecords = loadWorkRecords(), attendanceRecords = loadAttendanceRecords()): SummaryResult {
  const attendanceSalaryIds = new Set(attendanceRecords.map(record => salaryEntryIdForDate(record.date)))
  const overrides = ledger.filter(entry => entry.kind === 'salary_override' && entry.replacesId && !attendanceSalaryIds.has(entry.replacesId))
  const replacedSalaryIds = new Set(overrides.map(entry => entry.replacesId))
  const salaryEntries = salarySummaryEntries(profile, start, end, now, workRecords, attendanceRecords).filter(entry => !replacedSalaryIds.has(entry.id))
  const livingCostEntries = livingCostSummaryEntries(profile, start, end, now, livingCostSuppressedDates(profile, overrides))
  const storedEntries: SummaryEntry[] = ledger
    .filter(entry => !entry.deleted && isInRange(entry, start, end) && !(entry.kind === 'salary_override' && entry.replacesId && attendanceSalaryIds.has(entry.replacesId)))
    .map(entry => {
      const localDate = ledgerEntryLocalDate(entry)
      return {
        id: entry.kind === 'salary_override' && entry.replacesId ? entry.replacesId : entry.id,
        direction: entry.direction,
        amount: entry.amount,
        source: entry.source,
        category: categoryFor(entry),
        occurredAt: entry.occurredAt,
        ...(localDate ? { localDate } : {}),
        kind: entry.kind,
        ledgerEntryId: entry.id,
        replacesId: entry.replacesId,
      }
    })

  const entries = [...salaryEntries, ...livingCostEntries, ...storedEntries].sort((a, b) => {
    const left = a.localDate ? localDateAtNoon(a.localDate).getTime() : new Date(a.occurredAt).getTime()
    const right = b.localDate ? localDateAtNoon(b.localDate).getTime() : new Date(b.occurredAt).getTime()
    return right - left
  })
  const income = entries.filter(entry => entry.direction === 'income').reduce((sum, entry) => sum + entry.amount, 0)
  const expense = entries.filter(entry => entry.direction === 'expense').reduce((sum, entry) => sum + entry.amount, 0)
  return { income, expense, net: income - expense, entries }
}
