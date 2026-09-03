import type {
  ActiveOvertime,
  LedgerEntry,
  OvertimeSegment,
  OvertimeSession,
  OvertimeStartOption,
} from '../types'
import { keys, loadArray, loadJSON, saveJSON } from './storage'
import {
  isSessionLocalDate,
  isSessionTimezoneOffsetMinutes,
  resolveSessionStartBusinessDate,
  sessionStartLocalDate,
  shiftSessionLocalDate,
} from './sessionBusinessDate'

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

export function normalizeActiveOvertime(value: unknown): ActiveOvertime | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.startTime !== 'string') return null
  const metadata = resolveSessionStartBusinessDate(
    record.startTime,
    typeof record.startLocalDate === 'string' ? record.startLocalDate : undefined,
    typeof record.startTimezoneOffsetMinutes === 'number' ? record.startTimezoneOffsetMinutes : undefined,
  )
  if (!metadata) return null
  if (record.payMode === 'unpaid') return { payMode: 'unpaid', startTime: new Date(record.startTime).toISOString(), ...metadata }
  if (record.payMode === 'fixed' && typeof record.fixedAmount === 'number' && Number.isFinite(record.fixedAmount) && record.fixedAmount > 0) {
    return { payMode: 'fixed', fixedAmount: record.fixedAmount, startTime: new Date(record.startTime).toISOString(), ...metadata }
  }
  if (record.payMode === 'multiplier' && typeof record.multiplier === 'number' && Number.isFinite(record.multiplier) && record.multiplier > 0) {
    return { payMode: 'multiplier', multiplier: record.multiplier, startTime: new Date(record.startTime).toISOString(), ...metadata }
  }
  return null
}

export function loadActiveOvertime(): ActiveOvertime | null {
  const stored = loadJSON<unknown>(keys.activeOvertime, null)
  const normalized = normalizeActiveOvertime(stored)
  if (normalized && JSON.stringify(normalized) !== JSON.stringify(stored)) saveJSON(keys.activeOvertime, normalized)
  return normalized
}

export interface CompletedOvertimeInput extends OvertimeStartOption {
  id: string
  startTime: string
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
  endTime: string
  /** Actual paid-working slices. Omit for an uninterrupted overtime timer. */
  segments?: OvertimeSegment[]
}

function validTime(value: string): number | null {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeSegments(
  segments: readonly OvertimeSegment[] | undefined,
  sessionStart: number,
  sessionEnd: number,
): OvertimeSegment[] | null | undefined {
  if (segments === undefined) return undefined
  if (segments.length === 0) return null

  const normalized = segments.map(segment => {
    const start = validTime(segment.startTime)
    const end = validTime(segment.endTime)
    if (start === null || end === null || end <= start || start < sessionStart || end > sessionEnd) return null
    return { start, end, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() }
  })
  if (normalized.some(segment => segment === null)) return null

  const sorted = (normalized as Array<OvertimeSegment & { start: number; end: number }>)
    .sort((left, right) => left.start - right.start)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.start < sorted[index - 1]!.end) return null
  }
  return sorted.map(({ startTime, endTime }) => ({ startTime, endTime }))
}

/**
 * Builds one canonical completed overtime session for timers, backfills and
 * flexible-work excess. Invalid or zero-length input is rejected.
 */
export function createCompletedOvertimeSession(
  input: CompletedOvertimeInput,
  secondRate: number,
): OvertimeSession | null {
  const start = validTime(input.startTime)
  const end = validTime(input.endTime)
  if (!input.id.trim() || start === null || end === null || end <= start) return null

  const segments = normalizeSegments(input.segments, start, end)
  if (segments === null) return null
  const durationSeconds = segments
    ? segments.reduce((total, segment) => total + (new Date(segment.endTime).getTime() - new Date(segment.startTime).getTime()) / 1000, 0)
    : (end - start) / 1000
  if (!(durationSeconds > 0)) return null

  let option: OvertimeStartOption
  if (input.payMode === 'fixed') {
    if (!Number.isFinite(input.fixedAmount) || (input.fixedAmount ?? 0) <= 0) return null
    option = { payMode: 'fixed', fixedAmount: input.fixedAmount }
  } else if (input.payMode === 'multiplier') {
    if (!Number.isFinite(input.multiplier) || (input.multiplier ?? 0) <= 0) return null
    option = { payMode: 'multiplier', multiplier: input.multiplier }
  } else if (input.payMode === 'unpaid') {
    option = { payMode: 'unpaid' }
  } else {
    return null
  }

  const canonicalStart = new Date(start).toISOString()
  const canonicalEnd = new Date(end).toISOString()
  const businessDate = resolveSessionStartBusinessDate(
    canonicalStart,
    input.startLocalDate,
    input.startTimezoneOffsetMinutes,
  )
  if (!businessDate) return null
  return {
    ...option,
    id: input.id,
    startTime: canonicalStart,
    ...businessDate,
    endTime: canonicalEnd,
    durationSeconds,
    earnedAmount: calculateOvertimeEarnings(option, durationSeconds, secondRate),
    ...(segments ? { segments } : {}),
  }
}

/** Half-open intervals allow one overtime record to start exactly when another ends. */
export function overtimeIntervalsOverlap(
  leftStartTime: string,
  leftEndTime: string,
  rightStartTime: string,
  rightEndTime: string,
): boolean {
  const leftStart = validTime(leftStartTime)
  const leftEnd = validTime(leftEndTime)
  const rightStart = validTime(rightStartTime)
  const rightEnd = validTime(rightEndTime)
  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) return false
  return leftStart < rightEnd && rightStart < leftEnd
}

export function hasOverlappingOvertime(
  sessions: readonly Pick<OvertimeSession, 'startTime' | 'endTime'>[],
  startTime: string,
  endTime: string,
): boolean {
  return sessions.some(session => overtimeIntervalsOverlap(startTime, endTime, session.startTime, session.endTime))
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

function splitByLocalDay(
  startTime: string,
  endTime: string,
  timezoneOffsetMinutes?: number,
): OvertimeDaySlice[] {
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []

  const slices: OvertimeDaySlice[] = []
  let cursor = start.getTime()
  const endAt = end.getTime()
  const useStoredOffset = isSessionTimezoneOffsetMinutes(timezoneOffsetMinutes)
  while (cursor < endAt) {
    const current = new Date(cursor)
    let date: string
    let nextDayAt: number
    if (useStoredOffset) {
      const shifted = new Date(cursor - timezoneOffsetMinutes * 60_000)
      date = shifted.toISOString().slice(0, 10)
      nextDayAt = Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate() + 1,
      ) + timezoneOffsetMinutes * 60_000
    } else {
      date = localDateValue(current)
      nextDayAt = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1).getTime()
    }
    const sliceEndAt = Math.min(endAt, nextDayAt)
    slices.push({
      date,
      startTime: new Date(cursor).toISOString(),
      endTime: new Date(sliceEndAt).toISOString(),
      durationSeconds: (sliceEndAt - cursor) / 1000,
    })
    cursor = sliceEndAt
  }
  return slices
}

export function splitOvertimeSessionByLocalDay(session: Pick<OvertimeSession, 'startTime' | 'startLocalDate' | 'startTimezoneOffsetMinutes' | 'endTime' | 'segments'>): OvertimeDaySlice[] {
  const storedOffset = isSessionTimezoneOffsetMinutes(session.startTimezoneOffsetMinutes)
    ? session.startTimezoneOffsetMinutes
    : undefined
  const rawSlices = session.segments?.length
    ? session.segments.flatMap(segment => splitByLocalDay(segment.startTime, segment.endTime, storedOffset))
    : splitByLocalDay(session.startTime, session.endTime, storedOffset)
  // A legacy session can recover its original date from a linked ledger while
  // its former timezone offset is unknowable. Keep today's boundary durations
  // as a best effort, but shift every resulting label by the recovered date
  // delta so month/day attribution does not drift after travel.
  const stableStartDate = sessionStartLocalDate(session)
  const currentStartDate = localDateValue(new Date(session.startTime))
  const dateShift = storedOffset === undefined && isSessionLocalDate(session.startLocalDate)
    ? (Date.parse(`${stableStartDate}T00:00:00.000Z`) - Date.parse(`${currentStartDate}T00:00:00.000Z`)) / 86_400_000
    : 0
  const stableSlices = Number.isInteger(dateShift) && dateShift !== 0
    ? rawSlices.map(slice => ({ ...slice, date: shiftSessionLocalDate(slice.date, dateShift) }))
    : rawSlices
  const slices = [...stableSlices.reduce((byDate, slice) => {
    const existing = byDate.get(slice.date)
    if (!existing) {
      byDate.set(slice.date, { ...slice })
    } else {
      existing.startTime = existing.startTime < slice.startTime ? existing.startTime : slice.startTime
      existing.endTime = existing.endTime > slice.endTime ? existing.endTime : slice.endTime
      existing.durationSeconds += slice.durationSeconds
    }
    return byDate
  }, new Map<string, OvertimeDaySlice>()).values()]
  if (slices.length === 0) {
    const start = new Date(session.startTime)
    if (Number.isNaN(start.getTime())) return []
    return [{
      date: stableStartDate || localDateValue(start),
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
    localDate: sessionStartLocalDate(session),
    linkedId: session.id,
  }]
}

/** Adds stable start-day metadata to old sessions. A linked ledger localDate
 * wins because it is the only durable clue after the user changes timezone. */
export function migrateLegacyOvertimeSessionLocalDates(
  sessions: OvertimeSession[],
  entries: readonly LedgerEntry[] = [],
): OvertimeSession[] {
  let changed = false
  const migrated = sessions.map(session => {
    const linkedLedger = entries.find(entry => entry.kind === 'overtime' && entry.linkedId === session.id)
    const linkedLedgerDate = linkedLedger
      && isSessionLocalDate(linkedLedger.localDate)
      && isUntouchedGeneratedOvertimeEntry(linkedLedger, session)
      ? linkedLedger.localDate
      : undefined
    const preferredDate = isSessionLocalDate(session.startLocalDate)
      ? session.startLocalDate
      : linkedLedgerDate
    const metadata = resolveSessionStartBusinessDate(
      session.startTime,
      preferredDate,
      session.startTimezoneOffsetMinutes,
    )
    if (!metadata) return session
    if (session.startLocalDate === metadata.startLocalDate
      && session.startTimezoneOffsetMinutes === metadata.startTimezoneOffsetMinutes) return session
    changed = true
    const next = { ...session, startLocalDate: metadata.startLocalDate }
    if (metadata.startTimezoneOffsetMinutes === undefined) {
      delete next.startTimezoneOffsetMinutes
    } else {
      next.startTimezoneOffsetMinutes = metadata.startTimezoneOffsetMinutes
    }
    return next
  })
  return changed ? migrated : sessions
}

function isUntouchedGeneratedOvertimeEntry(entry: LedgerEntry, session: OvertimeSession): boolean {
  return entry.amount === session.earnedAmount
    && entry.source === `加班收入 · ${overtimePayLabel(session)}`
    && (entry.occurredAt === session.startTime || entry.occurredAt === session.endTime)
}

export function loadOvertimeSessions(): OvertimeSession[] {
  const stored = loadArray<OvertimeSession>(keys.overtimeSessions)
  const ledger = loadArray<LedgerEntry>(keys.ledger)
  const migrated = migrateLegacyOvertimeSessionLocalDates(stored, ledger)
  if (migrated !== stored) saveJSON(keys.overtimeSessions, migrated)
  return migrated
}

export function migrateLegacyOvertimeLedgerDates(entries: LedgerEntry[], sessions: OvertimeSession[]): LedgerEntry[] {
  const sessionsById = new Map(sessions.map(session => [session.id, session]))
  let changed = false
  const migrated = entries.map(entry => {
    if (entry.kind !== 'overtime' || !entry.linkedId) return entry
    const session = sessionsById.get(entry.linkedId)
    if (!session) return entry
    if (isSessionLocalDate(entry.localDate)) return entry
    const isUntouchedLegacyEntry = isUntouchedGeneratedOvertimeEntry(entry, session)
    if (!isUntouchedLegacyEntry) return entry
    const localDate = sessionStartLocalDate(session)
    if (!localDate) return entry
    changed = true
    // Preserve the established legacy repair for untouched generated entries:
    // very old versions wrote the end timestamp, while current income belongs
    // to the start instant. A manually edited timestamp does not match either
    // generated shape and is left alone above.
    return {
      ...entry,
      occurredAt: entry.occurredAt === session.endTime && session.startTime !== session.endTime
        ? session.startTime
        : entry.occurredAt,
      localDate,
    }
  })
  return changed ? migrated : entries
}
