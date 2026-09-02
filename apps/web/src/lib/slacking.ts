import type { ActiveSlacking, SlackingSession } from '../types'
import { resolveSessionStartBusinessDate } from './sessionBusinessDate'
import { keys, loadJSON, saveJSON } from './storage'

export interface CompletedSlackingInput {
  id: string
  startTime: string
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
  endTime: string
}

export interface CompletedSlackingCalculation {
  paidDurationSeconds: number
  earnedAmount: number
}

export function normalizeActiveSlacking(value: unknown): ActiveSlacking | null {
  const startTime = typeof value === 'string'
    ? value
    : typeof value === 'object' && value !== null && typeof (value as { startTime?: unknown }).startTime === 'string'
      ? (value as { startTime: string }).startTime
      : null
  if (!startTime) return null
  const record = typeof value === 'object' && value !== null
    ? value as Partial<ActiveSlacking>
    : {}
  const metadata = resolveSessionStartBusinessDate(
    startTime,
    record.startLocalDate,
    record.startTimezoneOffsetMinutes,
  )
  return metadata ? { startTime: new Date(startTime).toISOString(), ...metadata } : null
}

export function loadActiveSlacking(): ActiveSlacking | null {
  const stored = loadJSON<unknown>(keys.activeSlacking, null)
  const normalized = normalizeActiveSlacking(stored)
  if (normalized && JSON.stringify(normalized) !== JSON.stringify(stored)) {
    saveJSON(keys.activeSlacking, normalized)
  }
  return normalized
}

function timestamp(value: string): number | null {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function createCompletedSlackingSession(
  input: CompletedSlackingInput,
  rateOrCalculation: number | CompletedSlackingCalculation,
): SlackingSession | null {
  const start = timestamp(input.startTime)
  const end = timestamp(input.endTime)
  if (!input.id.trim() || start === null || end === null || end <= start) return null
  const durationSeconds = (end - start) / 1000
  const calculation = typeof rateOrCalculation === 'number'
    ? {
        paidDurationSeconds: durationSeconds,
        earnedAmount: durationSeconds * Math.max(0, Number.isFinite(rateOrCalculation) ? rateOrCalculation : 0),
      }
    : {
        paidDurationSeconds: Math.min(durationSeconds, Math.max(0, Number.isFinite(rateOrCalculation.paidDurationSeconds) ? rateOrCalculation.paidDurationSeconds : 0)),
        earnedAmount: Math.max(0, Number.isFinite(rateOrCalculation.earnedAmount) ? rateOrCalculation.earnedAmount : 0),
      }
  const canonicalStart = new Date(start).toISOString()
  const businessDate = resolveSessionStartBusinessDate(
    canonicalStart,
    input.startLocalDate,
    input.startTimezoneOffsetMinutes,
  )
  if (!businessDate) return null
  return {
    id: input.id,
    startTime: canonicalStart,
    ...businessDate,
    endTime: new Date(end).toISOString(),
    durationSeconds,
    paidDurationSeconds: calculation.paidDurationSeconds,
    earnedAmount: calculation.earnedAmount,
  }
}

export function slackingPaidDurationSeconds(session: Pick<SlackingSession, 'durationSeconds' | 'paidDurationSeconds'>): number {
  const paid = session.paidDurationSeconds
  return typeof paid === 'number' && Number.isFinite(paid)
    ? Math.min(Math.max(0, session.durationSeconds), Math.max(0, paid))
    : Math.max(0, Number.isFinite(session.durationSeconds) ? session.durationSeconds : 0)
}

export function migrateLegacySlackingSessionLocalDates(sessions: SlackingSession[]): SlackingSession[] {
  let changed = false
  const migrated = sessions.map(session => {
    const metadata = resolveSessionStartBusinessDate(
      session.startTime,
      session.startLocalDate,
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

export function loadSlackingSessions(): SlackingSession[] {
  const stored = loadJSON<SlackingSession[]>(keys.sessions, [])
  const migrated = migrateLegacySlackingSessionLocalDates(stored)
  if (migrated !== stored) saveJSON(keys.sessions, migrated)
  return migrated
}

export function hasOverlappingSlacking(
  sessions: readonly Pick<SlackingSession, 'startTime' | 'endTime'>[],
  startTime: string,
  endTime: string,
): boolean {
  const start = timestamp(startTime)
  const end = timestamp(endTime)
  if (start === null || end === null || end <= start) return false
  return sessions.some(session => {
    const sessionStart = timestamp(session.startTime)
    const sessionEnd = timestamp(session.endTime)
    return sessionStart !== null && sessionEnd !== null && start < sessionEnd && sessionStart < end
  })
}
