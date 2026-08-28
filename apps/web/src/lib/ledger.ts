import { calculateEarnedToday, calculateRates, type SalaryProfile } from '@salary-flow/core'
import type { LedgerDirection, LedgerEntry, LedgerKind } from '../types'
import { toLocalDateTime } from './form'
import { keys, loadJSON, saveJSON } from './storage'

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

function isConfiguredWorkday(date: Date, workDaysPerWeek: number): boolean {
  const normalized = Math.min(7, Math.max(1, Math.round(workDaysPerWeek)))
  const mondayBasedIndex = (date.getDay() + 6) % 7
  return mondayBasedIndex < normalized
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

function salarySummaryEntries(profile: SalaryProfile, start: Date, end: Date, now: Date): SummaryEntry[] {
  const rates = calculateRates(profile)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const effectiveDate = getSalaryEffectiveDate(profile, now)
  const entries: SummaryEntry[] = []
  const rangeStart = start > effectiveDate ? start : effectiveDate

  for (const cursor = new Date(rangeStart); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor)
    day.setHours(0, 0, 0, 0)
    if (day > today) break
    if (!isConfiguredWorkday(day, profile.workDaysPerWeek)) continue

    const amount = sameCalendarDay(day, today) ? calculateEarnedToday(profile, now) : rates.daily
    if (amount <= 0) continue
    const id = `salary-${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
    entries.push({
      id,
      direction: 'income',
      amount,
      source: '工资收入',
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
  if (entry.kind === 'manual') return '手工录入'
  if (entry.kind === 'salary_override') return '薪资调整'
  return entry.direction === 'income' ? '意外收入' : '意外花费'
}

function isInRange(value: string, start: Date, end: Date): boolean {
  const occurredAt = new Date(value)
  return !Number.isNaN(occurredAt.getTime()) && occurredAt >= start && occurredAt < end
}

export function summarizeLedger(profile: SalaryProfile, ledger: LedgerEntry[], start: Date, end: Date, now = new Date()): SummaryResult {
  const overrides = ledger.filter(entry => entry.kind === 'salary_override' && entry.replacesId)
  const replacedSalaryIds = new Set(overrides.map(entry => entry.replacesId))
  const salaryEntries = salarySummaryEntries(profile, start, end, now).filter(entry => !replacedSalaryIds.has(entry.id))
  const storedEntries: SummaryEntry[] = ledger
    .filter(entry => !entry.deleted && isInRange(entry.occurredAt, start, end))
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
