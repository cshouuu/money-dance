import { calculateEarnedToday, calculateRates, type SalaryProfile } from '@salary-flow/core'
import { keys, loadJSON, saveJSON } from './storage'
import type { LedgerEntry, LedgerDirection } from '../types'

export type SummaryDimension = 'day' | 'month' | 'year'

export interface SummaryEntry {
  id: string
  direction: LedgerDirection
  amount: number
  source: string
  category: string
  occurredAt: string
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
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
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

function salarySummaryEntries(profile: SalaryProfile, start: Date, end: Date, now: Date): SummaryEntry[] {
  const rates = calculateRates(profile)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const entries: SummaryEntry[] = []

  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor)
    day.setHours(0, 0, 0, 0)
    if (day > today) break
    if (!isConfiguredWorkday(day, profile.workDaysPerWeek)) continue

    const amount = sameCalendarDay(day, today) ? calculateEarnedToday(profile, now) : rates.daily
    if (amount <= 0) continue
    const occurredAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString()
    entries.push({
      id: `salary-${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`,
      direction: 'income',
      amount,
      source: '工资收入',
      category: '薪资',
      occurredAt,
    })
  }

  return entries
}

export function summarizeLedger(profile: SalaryProfile, ledger: LedgerEntry[], start: Date, end: Date, now = new Date()): SummaryResult {
  const salaryEntries = salarySummaryEntries(profile, start, end, now)
  const storedEntries: SummaryEntry[] = ledger
    .filter(entry => {
      const occurredAt = new Date(entry.occurredAt)
      return occurredAt >= start && occurredAt < end
    })
    .map(entry => ({
      id: entry.id,
      direction: entry.direction,
      amount: entry.amount,
      source: entry.source,
      category: entry.kind === 'purchase' ? '购买' : entry.direction === 'income' ? '意外收入' : '意外花费',
      occurredAt: entry.occurredAt,
    }))

  const entries = [...salaryEntries, ...storedEntries].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  const income = entries.filter(entry => entry.direction === 'income').reduce((sum, entry) => sum + entry.amount, 0)
  const expense = entries.filter(entry => entry.direction === 'expense').reduce((sum, entry) => sum + entry.amount, 0)
  return { income, expense, net: income - expense, entries }
}
