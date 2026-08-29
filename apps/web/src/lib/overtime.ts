import type { ActiveOvertime, LedgerEntry, OvertimeSession } from '../types'

export const OVERTIME_MULTIPLIERS = [1, 1.5, 2, 3, 4, 5] as const

export function calculateOvertimeEarnings(option: Pick<ActiveOvertime, 'payMode' | 'multiplier' | 'fixedAmount'>, durationSeconds: number, secondRate: number): number {
  if (option.payMode === 'unpaid') return 0
  if (option.payMode === 'fixed') return Math.max(0, option.fixedAmount ?? 0)
  return Math.max(0, durationSeconds) * Math.max(0, secondRate) * Math.max(0, option.multiplier ?? 1)
}

export function overtimePayLabel(option: Pick<ActiveOvertime, 'payMode' | 'multiplier' | 'fixedAmount'>): string {
  if (option.payMode === 'unpaid') return '无加班费'
  if (option.payMode === 'fixed') return `固定 ¥${(option.fixedAmount ?? 0).toFixed(2)}`
  return `${option.multiplier ?? 1} 倍工资`
}

export interface OvertimeDaySlice {
  date: string
  startTime: string
  endTime: string
  durationSeconds: number
}

function localDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function splitByLocalDay(startTime: string, endTime: string): OvertimeDaySlice[] {
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []

  const slices: OvertimeDaySlice[] = []
  let cursor = start
  while (cursor < end) {
    const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    const sliceEnd = end < nextDay ? end : nextDay
    slices.push({
      date: localDateValue(cursor),
      startTime: cursor.toISOString(),
      endTime: sliceEnd.toISOString(),
      durationSeconds: (sliceEnd.getTime() - cursor.getTime()) / 1000,
    })
    cursor = sliceEnd
  }
  return slices
}

export function splitOvertimeSessionByLocalDay(session: Pick<OvertimeSession, 'startTime' | 'endTime'>): OvertimeDaySlice[] {
  const slices = splitByLocalDay(session.startTime, session.endTime)
  if (slices.length === 0) {
    const start = new Date(session.startTime)
    if (Number.isNaN(start.getTime())) return []
    return [{
      date: localDateValue(start),
      startTime: start.toISOString(),
      endTime: start.toISOString(),
      durationSeconds: 0,
    }]
  }
  return slices
}

export function createOvertimeLedgerEntries(session: OvertimeSession, createEntryId: () => string): LedgerEntry[] {
  if (session.earnedAmount <= 0) return []
  return [{
    id: createEntryId(),
    kind: 'overtime',
    direction: 'income',
    amount: session.earnedAmount,
    source: `加班收入 · ${overtimePayLabel(session)}`,
    occurredAt: session.startTime,
    linkedId: session.id,
  }]
}
