import { calculateEarnedToday, calculateRates, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, LedgerDirection, LedgerEntry, LedgerKind } from '../types'
import { isConfiguredWorkday, leaveTypeLabel, loadAttendanceRecords } from './attendance'
import { toLocalDateTime, toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'
import { getFlexibleWorkedSeconds, loadWorkRecords } from './work'

export type SummaryDimension = 'day' | 'month' | 'year'

export interface SummaryEntry {
  id: string
  direction: LedgerDirection
  amount: number
  source: string
  category: string
  occurredAt: string
  kind: LedgerKind | 'salary'
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
  return loadJSON<LedgerEntry[]>(keys.ledger, [])
}

export function saveLedger(entries: LedgerEntry[]): void {
  saveJSON(keys.ledger, entries)
}

export function appendLedgerEntry(entry: LedgerEntry): LedgerEntry[] {
  const next = [entry, ...loadLedger()]
  saveLedger(next)
  return next
}

export function localDateAtNoon(value: string): Date {
  return toLocalDateTime(value)
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

function salarySummaryEntries(profile: SalaryProfile, start: Date, end: Date, now: Date, workRecords: DailyWorkRecord[], attendanceRecords: AttendanceRecord[]): SummaryEntry[] {
  const rates = calculateRates(profile)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const effectiveDate = getSalaryEffectiveDate(profile, now)
  const entries: SummaryEntry[] = []
  const rangeStart = start > effectiveDate ? start : effectiveDate
  const workRecordByDate = new Map(workRecords.map(record => [record.date, record]))
  const attendanceByDate = new Map(attendanceRecords.map(record => [record.date, record]))

  for (const cursor = new Date(rangeStart); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor)
    day.setHours(0, 0, 0, 0)
    if (day > today) break
    const date = toLocalDateValue(day)
    const workRecord = workRecordByDate.get(date)
    const attendance = attendanceByDate.get(date)
    let amount = 0
    let source = '工资收入'
    if (attendance?.status === 'leave') {
      source = `工资收入 · ${leaveTypeLabel(attendance.leaveType)}`
      if (attendance.payMode === 'multiplier') amount = rates.daily * Math.max(0, attendance.multiplier ?? 0)
      if (attendance.payMode === 'fixed') amount = Math.max(0, attendance.fixedAmount ?? 0)
    } else {
      const workMode = workRecord?.mode ?? profile.defaultWorkMode
      if (workMode === 'flexible') {
        if (workRecord) amount = getFlexibleWorkedSeconds(workRecord, now, rates.paidSecondsPerDay) * rates.second
        else if (attendance?.status === 'normal' && !sameCalendarDay(day, today)) amount = rates.daily
      } else {
        if (!workRecord && attendance?.status !== 'normal' && !isConfiguredWorkday(day, profile.workDaysPerWeek)) continue
        amount = sameCalendarDay(day, today) ? calculateEarnedToday(profile, now) : rates.daily
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
      kind: 'salary',
      generated: true,
    })
  }

  return entries
}

function categoryFor(entry: LedgerEntry): string {
  if (entry.kind === 'purchase') return '购买'
  if (entry.kind === 'overtime') return '加班收入'
  if (entry.kind === 'manual') return '手工录入'
  if (entry.kind === 'salary_override') return '薪资调整'
  return entry.direction === 'income' ? '意外收入' : '意外花费'
}

function isInRange(value: string, start: Date, end: Date): boolean {
  const occurredAt = new Date(value)
  return !Number.isNaN(occurredAt.getTime()) && occurredAt >= start && occurredAt < end
}

export function summarizeLedger(profile: SalaryProfile, ledger: LedgerEntry[], start: Date, end: Date, now = new Date(), workRecords = loadWorkRecords(), attendanceRecords = loadAttendanceRecords()): SummaryResult {
  const attendanceSalaryIds = new Set(attendanceRecords.map(record => salaryEntryIdForDate(record.date)))
  const overrides = ledger.filter(entry => entry.kind === 'salary_override' && entry.replacesId && !attendanceSalaryIds.has(entry.replacesId))
  const replacedSalaryIds = new Set(overrides.map(entry => entry.replacesId))
  const salaryEntries = salarySummaryEntries(profile, start, end, now, workRecords, attendanceRecords).filter(entry => !replacedSalaryIds.has(entry.id))
  const storedEntries: SummaryEntry[] = ledger
    .filter(entry => !entry.deleted && isInRange(entry.occurredAt, start, end) && !(entry.kind === 'salary_override' && entry.replacesId && attendanceSalaryIds.has(entry.replacesId)))
    .map(entry => ({
      id: entry.kind === 'salary_override' && entry.replacesId ? entry.replacesId : entry.id,
      direction: entry.direction,
      amount: entry.amount,
      source: entry.source,
      category: categoryFor(entry),
      occurredAt: entry.occurredAt,
      kind: entry.kind,
      ledgerEntryId: entry.id,
      replacesId: entry.replacesId,
    }))

  const entries = [...salaryEntries, ...storedEntries].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  const income = entries.filter(entry => entry.direction === 'income').reduce((sum, entry) => sum + entry.amount, 0)
  const expense = entries.filter(entry => entry.direction === 'expense').reduce((sum, entry) => sum + entry.amount, 0)
  return { income, expense, net: income - expense, entries }
}
