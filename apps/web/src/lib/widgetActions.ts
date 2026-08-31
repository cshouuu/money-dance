import type { ActiveOvertime, ActiveSlacking, LedgerEntry, OvertimePayMode, OvertimeSession, SlackingSession } from '../types'
import { createOvertimeLedgerEntries, migrateLegacyOvertimeLedgerDates, migrateLegacyOvertimeSessionLocalDates } from './overtime'
import { isSessionLocalDate, isSessionTimezoneOffsetMinutes, resolveSessionStartBusinessDate } from './sessionBusinessDate'
import { migrateLegacySlackingSessionLocalDates, normalizeActiveSlacking } from './slacking'
import { keys } from './storage'

export interface WidgetActionBase {
  actionId: string
  occurredAt: number
  sessionId: string
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
}

export interface WidgetSlackingStartAction extends WidgetActionBase {
  type: 'slacking_start'
}

export interface WidgetSlackingStopAction extends WidgetActionBase {
  type: 'slacking_stop'
  startAt: number
  endAt: number
  earnedAmount: number
}

export interface WidgetOvertimeStopAction extends WidgetActionBase {
  type: 'overtime_stop'
  startAt: number
  endAt: number
  earnedAmount: number
  payMode: OvertimePayMode
  multiplier?: number
  fixedAmount?: number
}

export type WidgetAction = WidgetSlackingStartAction | WidgetSlackingStopAction | WidgetOvertimeStopAction

export interface WidgetActionState {
  activeSlacking: ActiveSlacking | null
  slackingSessions: SlackingSession[]
  activeOvertime: ActiveOvertime | null
  overtimeSessions: OvertimeSession[]
  ledger: LedgerEntry[]
}

export type WidgetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface ApplyWidgetActionsResult {
  success: boolean
  changed: boolean
  actionIds: string[]
}

export interface SlackingWebStopContext {
  shouldStop: boolean
  active: ActiveSlacking | null
  sessions: SlackingSession[]
  completedSession: SlackingSession | null
}

export interface OvertimeWebStopContext {
  shouldStop: boolean
  active: ActiveOvertime | null
  sessions: OvertimeSession[]
  ledger: LedgerEntry[]
  completedSession: OvertimeSession | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isEpochMilliseconds(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= 8_640_000_000_000_000
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPayMode(value: unknown): value is OvertimePayMode {
  return value === 'unpaid' || value === 'multiplier' || value === 'fixed'
}

function parseAction(value: unknown): WidgetAction | null {
  if (!isRecord(value)
    || !isNonEmptyString(value.actionId)
    || !isNonEmptyString(value.sessionId)
    || !isEpochMilliseconds(value.occurredAt)) return null

  const base = {
    actionId: value.actionId,
    occurredAt: value.occurredAt,
    sessionId: value.sessionId,
    ...(isSessionLocalDate(value.startLocalDate) ? { startLocalDate: value.startLocalDate } : {}),
    ...(isSessionTimezoneOffsetMinutes(value.startTimezoneOffsetMinutes)
      ? { startTimezoneOffsetMinutes: value.startTimezoneOffsetMinutes }
      : {}),
  }
  if (value.type === 'slacking_start') return { ...base, type: value.type }

  if ((value.type !== 'slacking_stop' && value.type !== 'overtime_stop')
    || !isEpochMilliseconds(value.startAt)
    || !isEpochMilliseconds(value.endAt)
    || !isFiniteNumber(value.earnedAmount)) return null

  if (value.type === 'slacking_stop') {
    return {
      ...base,
      type: value.type,
      startAt: value.startAt,
      endAt: value.endAt,
      earnedAmount: value.earnedAmount,
    }
  }

  if (!isPayMode(value.payMode)) return null
  if (value.multiplier !== undefined && !isFiniteNumber(value.multiplier)) return null
  if (value.fixedAmount !== undefined && !isFiniteNumber(value.fixedAmount)) return null
  return {
    ...base,
    type: value.type,
    startAt: value.startAt,
    endAt: value.endAt,
    earnedAmount: value.earnedAmount,
    payMode: value.payMode,
    ...(value.multiplier === undefined ? {} : { multiplier: value.multiplier }),
    ...(value.fixedAmount === undefined ? {} : { fixedAmount: value.fixedAmount }),
  }
}

/** Accepts either the native bridge's JSON string or an already-decoded array. */
export function parseWidgetActions(value: unknown): WidgetAction[] {
  let decoded = value
  if (typeof value === 'string') {
    try {
      decoded = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(decoded)) return []
  return decoded.map(parseAction).filter((action): action is WidgetAction => action !== null)
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function isoTime(value: number): string {
  return new Date(value).toISOString()
}

function sameStart(value: string | undefined, startAt: number): boolean {
  if (!value) return false
  return new Date(value).getTime() === startAt
}

function sessionWithStart<T extends { startTime: string }>(sessions: readonly T[], startAt: number): T | undefined {
  return sessions.find(session => sameStart(session.startTime, startAt))
}

function durationSeconds(startAt: number, endAt: number): number {
  return Math.max(0, endAt - startAt) / 1000
}

function actionBusinessDate(
  action: WidgetActionBase & { startAt: number },
  fallback?: { startLocalDate?: string; startTimezoneOffsetMinutes?: number } | null,
) {
  const hasActionDate = isSessionLocalDate(action.startLocalDate)
  const hasActionOffset = isSessionTimezoneOffsetMinutes(action.startTimezoneOffsetMinutes)
  if (!hasActionDate && !hasActionOffset && fallback && isSessionLocalDate(fallback.startLocalDate)) {
    return {
      startLocalDate: fallback.startLocalDate,
      ...(isSessionTimezoneOffsetMinutes(fallback.startTimezoneOffsetMinutes)
        ? { startTimezoneOffsetMinutes: fallback.startTimezoneOffsetMinutes }
        : {}),
    }
  }
  return resolveSessionStartBusinessDate(
    isoTime(action.startAt),
    hasActionDate ? action.startLocalDate : fallback?.startLocalDate,
    hasActionOffset ? action.startTimezoneOffsetMinutes : fallback?.startTimezoneOffsetMinutes,
  )
}

function overtimeSessionFromAction(action: WidgetOvertimeStopAction): OvertimeSession {
  const payOption = action.payMode === 'fixed'
    ? { payMode: action.payMode, fixedAmount: nonNegative(action.fixedAmount ?? 0) }
    : action.payMode === 'multiplier'
      ? { payMode: action.payMode, multiplier: nonNegative(action.multiplier ?? 1) }
      : { payMode: action.payMode }
  return {
    ...payOption,
    id: action.sessionId,
    startTime: isoTime(action.startAt),
    ...actionBusinessDate(action),
    endTime: isoTime(action.endAt),
    durationSeconds: durationSeconds(action.startAt, action.endAt),
    earnedAmount: action.payMode === 'unpaid' ? 0 : nonNegative(action.earnedAmount),
  }
}

function ensureOvertimeLedger(ledger: LedgerEntry[], session: OvertimeSession): LedgerEntry[] {
  if (session.earnedAmount <= 0) return ledger
  const migrated = migrateLegacyOvertimeLedgerDates(ledger, [session])
  if (migrated.some(entry => entry.kind === 'overtime' && entry.linkedId === session.id)) return migrated
  const entries = createOvertimeLedgerEntries(session, () => `widget-overtime-ledger-${session.id}`)
  return entries.length === 0 ? migrated : [...entries, ...migrated]
}

/** Pure reducer. Keeping this separate makes replay and idempotency testable. */
export function reduceWidgetActions(initial: WidgetActionState, actions: WidgetAction[]): WidgetActionState {
  let activeSlacking = initial.activeSlacking
  let slackingSessions = initial.slackingSessions
  let activeOvertime = initial.activeOvertime
  let overtimeSessions = initial.overtimeSessions
  let ledger = initial.ledger

  for (const action of actions) {
    if (action.type === 'slacking_start') {
      const alreadyFinished = slackingSessions.some(session => session.id === action.sessionId)
      if (!alreadyFinished && !activeSlacking) {
        const startTime = isoTime(action.occurredAt)
        const businessDate = resolveSessionStartBusinessDate(
          startTime,
          action.startLocalDate,
          action.startTimezoneOffsetMinutes,
        )
        if (businessDate) activeSlacking = { startTime, ...businessDate }
      }
      continue
    }

    if (action.type === 'slacking_stop') {
      const existing = slackingSessions.find(session => session.id === action.sessionId)
        ?? sessionWithStart(slackingSessions, action.startAt)
      const matchingActive = sameStart(activeSlacking?.startTime, action.startAt) ? activeSlacking : null
      const session: SlackingSession = {
        ...(existing ?? {
          id: action.sessionId,
          startTime: isoTime(action.startAt),
          endTime: isoTime(action.endAt),
          durationSeconds: durationSeconds(action.startAt, action.endAt),
          earnedAmount: nonNegative(action.earnedAmount),
        }),
        ...actionBusinessDate(action, matchingActive ?? existing),
      }
      slackingSessions = existing
        ? slackingSessions.map(item => item === existing ? session : item)
        : [session, ...slackingSessions]
      if (matchingActive) activeSlacking = null
      continue
    }

    // Native and Web stops can race before the bridge has acknowledged the
    // native journal. The start timestamp identifies the same logical timer
    // even when each layer generated a different session ID.
    const existing = overtimeSessions.find(session => session.id === action.sessionId)
      ?? sessionWithStart(overtimeSessions, action.startAt)
    const matchingActive = sameStart(activeOvertime?.startTime, action.startAt) ? activeOvertime : null
    const session = {
      ...(existing ?? overtimeSessionFromAction(action)),
      ...actionBusinessDate(action, matchingActive ?? existing),
    }
    overtimeSessions = existing
      ? overtimeSessions.map(item => item === existing ? session : item)
      : [session, ...overtimeSessions]
    // A previous partial write may already contain the session but not its
    // ledger entry, so ledger reconciliation must also run during a replay.
    ledger = ensureOvertimeLedger(ledger, session)
    if (matchingActive) activeOvertime = null
  }

  return { activeSlacking, slackingSessions, activeOvertime, overtimeSessions, ledger }
}

function readJSON<T>(storage: WidgetStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export function loadWidgetActionState(storage: WidgetStorage): WidgetActionState {
  const activeSlacking = readJSON<unknown>(storage, keys.activeSlacking, null)
  const slackingSessions = readJSON<unknown>(storage, keys.sessions, [])
  const activeOvertime = readJSON<unknown>(storage, keys.activeOvertime, null)
  const overtimeSessions = readJSON<unknown>(storage, keys.overtimeSessions, [])
  const ledger = readJSON<unknown>(storage, keys.ledger, [])
  const validLedger = Array.isArray(ledger)
    ? ledger.filter((entry): entry is LedgerEntry => isRecord(entry) && isNonEmptyString(entry.id))
    : []
  const validSlackingSessions = Array.isArray(slackingSessions)
    ? slackingSessions.filter((session): session is SlackingSession => isRecord(session) && isNonEmptyString(session.id))
    : []
  const validOvertimeSessions = Array.isArray(overtimeSessions)
    ? overtimeSessions.filter((session): session is OvertimeSession => isRecord(session) && isNonEmptyString(session.id))
    : []
  const migratedOvertimeSessions = migrateLegacyOvertimeSessionLocalDates(validOvertimeSessions, validLedger)
  return {
    activeSlacking: normalizeActiveSlacking(activeSlacking),
    slackingSessions: migrateLegacySlackingSessionLocalDates(validSlackingSessions),
    activeOvertime: isRecord(activeOvertime)
      && typeof activeOvertime.startTime === 'string'
      && isPayMode(activeOvertime.payMode)
      ? activeOvertime as unknown as ActiveOvertime
      : null,
    overtimeSessions: migratedOvertimeSessions,
    ledger: migrateLegacyOvertimeLedgerDates(validLedger, migratedOvertimeSessions),
  }
}

/**
 * Re-reads storage immediately before a Web stop. Native widget actions can be
 * applied while React still holds the previous render, so captured component
 * state is not authoritative at this boundary.
 */
export function prepareSlackingWebStop(
  expectedStartTime: string,
  providedStorage?: WidgetStorage,
): SlackingWebStopContext {
  const storage = providedStorage ?? globalThis.localStorage
  const state = loadWidgetActionState(storage)
  const startAt = new Date(expectedStartTime).getTime()
  const completedSession = Number.isFinite(startAt)
    ? sessionWithStart(state.slackingSessions, startAt) ?? null
    : null
  return {
    shouldStop: completedSession === null && sameStart(state.activeSlacking?.startTime, startAt),
    active: state.activeSlacking,
    sessions: state.slackingSessions,
    completedSession,
  }
}

/** Same guard as above, including the current ledger so a Web stop never
 * overwrites a native ledger entry written just before the click. */
export function prepareOvertimeWebStop(
  expectedStartTime: string,
  providedStorage?: WidgetStorage,
): OvertimeWebStopContext {
  const storage = providedStorage ?? globalThis.localStorage
  const state = loadWidgetActionState(storage)
  const startAt = new Date(expectedStartTime).getTime()
  const completedSession = Number.isFinite(startAt)
    ? sessionWithStart(state.overtimeSessions, startAt) ?? null
    : null
  return {
    shouldStop: completedSession === null && sameStart(state.activeOvertime?.startTime, startAt),
    active: state.activeOvertime,
    sessions: state.overtimeSessions,
    ledger: state.ledger,
    completedSession,
  }
}

function equalJSON(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function writeJSON(storage: WidgetStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function remove(storage: WidgetStorage, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Applies native actions to the WebView's localStorage. Callers should only ack
 * `actionIds` when `success` is true. A failed partial write is safe to replay:
 * session and ledger identifiers are stable and every mutation is idempotent.
 */
export function applyWidgetActions(actions: WidgetAction[], providedStorage?: WidgetStorage): ApplyWidgetActionsResult {
  const storage = providedStorage ?? globalThis.localStorage
  if (!storage) return { success: false, changed: false, actionIds: [] }
  const initial = loadWidgetActionState(storage)
  const next = reduceWidgetActions(initial, actions)
  let success = true
  let changed = false

  const writeValue = (key: string, before: unknown, after: unknown) => {
    if (equalJSON(before, after)) return
    changed = true
    success = writeJSON(storage, key, after) && success
  }
  const writeActive = (key: string, before: unknown, after: unknown) => {
    if (equalJSON(before, after)) return
    changed = true
    success = (after === null ? remove(storage, key) : writeJSON(storage, key, after)) && success
  }

  writeActive(keys.activeSlacking, initial.activeSlacking, next.activeSlacking)
  writeValue(keys.sessions, initial.slackingSessions, next.slackingSessions)
  writeActive(keys.activeOvertime, initial.activeOvertime, next.activeOvertime)
  writeValue(keys.overtimeSessions, initial.overtimeSessions, next.overtimeSessions)
  writeValue(keys.ledger, initial.ledger, next.ledger)

  return {
    success,
    changed,
    actionIds: success ? [...new Set(actions.map(action => action.actionId))] : [],
  }
}
