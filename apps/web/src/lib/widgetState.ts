import { calculateRates, type SalaryProfile, type SalaryRates } from '@salary-flow/core'
import type { ActiveOvertime, ActiveSlacking, AttendanceRecord, DailyWorkRecord, OvertimePayMode } from '../types'
import { toLocalDateTime, toLocalDateValue } from './form'
import { calculatePaidTimeEarnings } from './paidTime'
import { salaryProfileForBusinessDate } from './profile'
import { resolveSessionStartBusinessDate } from './sessionBusinessDate'
import { normalizeActiveSlacking } from './slacking'
import { getScheduledBusinessDate, summarizeTodayWork } from './work'

export const WIDGET_SNAPSHOT_VERSION = 1 as const
export const WIDGET_SNAPSHOT_HORIZON_MS = 36 * 60 * 60 * 1000

export interface WidgetTimelineSegment {
  startAt: number
  endAt: number
  baseAmount: number
  ratePerSecond: number
}

export interface WidgetActiveSlacking {
  active: true
  startAt: number
  startLocalDate: string
  startTimezoneOffsetMinutes?: number
  earnedAmountAtSync: number
  paidSecondsAtSync: number
}

export interface WidgetActiveOvertime {
  active: true
  startAt: number
  startLocalDate: string
  startTimezoneOffsetMinutes?: number
  payMode: OvertimePayMode
  multiplier?: number
  fixedAmount?: number
}

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION
  syncedAt: number
  validUntil: number
  secondRate: number
  workTimeline: WidgetTimelineSegment[]
  slacking?: WidgetActiveSlacking
  overtime?: WidgetActiveOvertime
}

export interface BuildWidgetSnapshotOptions {
  profile: SalaryProfile
  workRecords: DailyWorkRecord[]
  attendanceRecords: AttendanceRecord[]
  activeSlacking?: ActiveSlacking | string | null
  activeOvertime?: ActiveOvertime | null
  now?: Date
  rates?: SalaryRates
  horizonMs?: number
}

interface BuildTimelineOptions {
  profile: SalaryProfile
  workRecords: DailyWorkRecord[]
  attendanceRecords: AttendanceRecord[]
  rates: SalaryRates
  startAt: number
  endAt: number
}

const MINUTE_MS = 60_000
const MONEY_EPSILON = 0.000_001
const RATE_EPSILON = 0.000_000_001

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function timestamp(value: string | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function relevantDateValues(startAt: number, endAt: number): Set<string> {
  const values = new Set<string>()
  const cursor = new Date(startAt)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(endAt)
  last.setHours(0, 0, 0, 0)
  while (cursor <= last) {
    values.add(toLocalDateValue(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return values
}

function flexibleRecordTouchesRange(record: DailyWorkRecord, _startAt: number, endAt: number): boolean {
  if (record.mode !== 'flexible' || (record.status !== 'working' && record.status !== 'paused' && !record.settlementPending)) return false
  const firstStartAt = timestamp(record.sessions[0]?.startTime)
  // Match getCurrentWorkRecord: a carried paused/pending shift still owns its
  // frozen salary after every session (or planned stop) is before this range.
  // Requiring interval overlap would make the native widget fall back to ¥0.
  return firstStartAt !== null && firstStartAt < endAt
}

function samplePoints(startAt: number, endAt: number, boundaries: readonly number[] = []): number[] {
  const points = new Set<number>([startAt, endAt])
  let cursor = (Math.floor(startAt / MINUTE_MS) + 1) * MINUTE_MS
  while (cursor < endAt) {
    points.add(cursor)
    cursor += MINUTE_MS
  }
  for (const boundary of boundaries) {
    if (Number.isFinite(boundary) && boundary > startAt && boundary < endAt) points.add(boundary)
  }
  return [...points].sort((left, right) => left - right)
}

/**
 * Flexible sessions can start, stop, or reach their daily paid-time cap between
 * minute boundaries. Including those exact instants prevents the native
 * widget from displaying up to a minute of salary beyond the Web calculation.
 */
function flexibleWorkBoundaries(
  records: readonly DailyWorkRecord[],
  rates: SalaryRates,
  startAt: number,
  endAt: number,
): number[] {
  const boundaries: number[] = []
  for (const record of records) {
    if (record.mode !== 'flexible') continue
    const plannedEndAt = timestamp(record.plannedEndTime)
    if (plannedEndAt !== null && plannedEndAt > startAt && plannedEndAt < endAt) {
      boundaries.push(plannedEndAt)
    }
    let completedSeconds = 0
    let activeStartAt: number | null = null
    for (const session of record.sessions) {
      const sessionStartAt = timestamp(session.startTime)
      const sessionEndAt = timestamp(session.endTime)
      if (sessionStartAt !== null && sessionStartAt > startAt && sessionStartAt < endAt) {
        boundaries.push(sessionStartAt)
      }
      if (sessionEndAt !== null && sessionEndAt > startAt && sessionEndAt < endAt) {
        boundaries.push(sessionEndAt)
      }
      if (sessionStartAt === null) continue
      if (sessionEndAt !== null) {
        completedSeconds += Math.max(0, sessionEndAt - sessionStartAt) / 1000
      } else {
        activeStartAt = sessionStartAt
      }
    }

    if (activeStartAt !== null) {
      const remainingSeconds = Math.max(0, rates.paidSecondsPerDay - completedSeconds)
      const paidTimeCapAt = activeStartAt + remainingSeconds * 1000
      if (paidTimeCapAt > startAt && paidTimeCapAt < endAt) boundaries.push(paidTimeCapAt)
    }
  }
  return boundaries
}

function closeEnough(left: number, right: number, epsilon: number): boolean {
  return Math.abs(left - right) <= epsilon
}

/**
 * Samples the existing salary calculation at minute-aligned boundaries. Work
 * settings are minute-based, so this keeps the Android side free of duplicated
 * salary rules while still giving it piecewise-linear data for second ticks.
 */
export function buildWorkTimeline(options: BuildTimelineOptions): WidgetTimelineSegment[] {
  const { profile, rates, startAt, endAt } = options
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return []

  const relevantDates = relevantDateValues(startAt, endAt)
  const workRecords = options.workRecords.filter(record => (
    relevantDates.has(record.date) || flexibleRecordTouchesRange(record, startAt, endAt)
  ))
  const relevantAttendanceDates = new Set(relevantDates)
  if (profile.defaultWorkMode === 'scheduled') {
    // An overnight fixed shift still belongs to the date on which it started.
    // Include that prior date before filtering the snapshot payload, otherwise
    // the Android widget could silently lose a manual attendance override that
    // the Dashboard correctly applies after midnight.
    for (const date of relevantDates) {
      relevantAttendanceDates.add(getScheduledBusinessDate(profile, toLocalDateTime(date)))
    }
  }
  for (const record of workRecords) relevantAttendanceDates.add(record.date)
  const attendanceRecords = options.attendanceRecords.filter(record => relevantAttendanceDates.has(record.date))
  const amountCache = new Map<number, number>()
  const amountAt = (time: number) => {
    const cached = amountCache.get(time)
    if (cached !== undefined) return cached
    const amount = finiteNonNegative(summarizeTodayWork(
      profile,
      workRecords,
      new Date(time),
      rates,
      attendanceRecords,
    ).earnedAmount)
    amountCache.set(time, amount)
    return amount
  }

  const points = samplePoints(
    startAt,
    endAt,
    flexibleWorkBoundaries(workRecords, rates, startAt, endAt),
  )
  const timeline: WidgetTimelineSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index]!
    const segmentEnd = points[index + 1]!
    const baseAmount = amountAt(segmentStart)
    // Stay strictly inside the interval so a discontinuity at its end (for
    // example midnight) does not leak into the preceding segment's slope.
    const sampleDurationMs = Math.min(1000, Math.max(1, (segmentEnd - segmentStart) / 2))
    const sampledAmount = amountAt(segmentStart + sampleDurationMs)
    const rawRate = finiteNonNegative((sampledAmount - baseAmount) / (sampleDurationMs / 1000))
    const ratePerSecond = Math.abs(rawRate) <= RATE_EPSILON ? 0 : rawRate
    const previous = timeline.at(-1)

    if (previous) {
      const expectedBase = previous.baseAmount
        + ((segmentStart - previous.startAt) / 1000) * previous.ratePerSecond
      if (
        closeEnough(previous.ratePerSecond, ratePerSecond, RATE_EPSILON)
        && closeEnough(expectedBase, baseAmount, MONEY_EPSILON)
      ) {
        previous.endAt = segmentEnd
        continue
      }
    }

    timeline.push({
      startAt: segmentStart,
      endAt: segmentEnd,
      baseAmount,
      ratePerSecond,
    })
  }
  return timeline
}

function widgetOvertime(active: ActiveOvertime | null | undefined): WidgetActiveOvertime | undefined {
  const startAt = timestamp(active?.startTime)
  if (!active || startAt === null) return undefined
  const businessDate = resolveSessionStartBusinessDate(
    active.startTime,
    active.startLocalDate,
    active.startTimezoneOffsetMinutes,
  )
  if (!businessDate) return undefined
  if (active.payMode === 'fixed') {
    return {
      active: true,
      startAt,
      ...businessDate,
      payMode: active.payMode,
      fixedAmount: finiteNonNegative(active.fixedAmount ?? 0),
    }
  }
  if (active.payMode === 'multiplier') {
    return {
      active: true,
      startAt,
      ...businessDate,
      payMode: active.payMode,
      multiplier: finiteNonNegative(active.multiplier ?? 1),
    }
  }
  return { active: true, startAt, ...businessDate, payMode: 'unpaid' }
}

export function buildWidgetSnapshot(options: BuildWidgetSnapshotOptions): WidgetSnapshot {
  const syncedAt = options.now?.getTime() ?? Date.now()
  const safeSyncedAt = Number.isFinite(syncedAt) ? syncedAt : Date.now()
  const requestedHorizon = options.horizonMs ?? WIDGET_SNAPSHOT_HORIZON_MS
  const horizonMs = Number.isFinite(requestedHorizon) ? Math.max(1000, requestedHorizon) : WIDGET_SNAPSHOT_HORIZON_MS
  const validUntil = safeSyncedAt + horizonMs
  const rates = options.rates ?? calculateRates(salaryProfileForBusinessDate(
    options.profile,
    toLocalDateValue(new Date(safeSyncedAt)),
    options.attendanceRecords,
  ))
  const activeSlacking = normalizeActiveSlacking(options.activeSlacking)
  const slackingStartAt = timestamp(activeSlacking?.startTime)
  const slackingBusinessDate = slackingStartAt === null || !activeSlacking
    ? null
    : resolveSessionStartBusinessDate(
      activeSlacking.startTime,
      activeSlacking.startLocalDate,
      activeSlacking.startTimezoneOffsetMinutes,
    )
  const overtime = widgetOvertime(options.activeOvertime)
  const slackingAtSync = slackingStartAt === null || !activeSlacking
    ? null
    : calculatePaidTimeEarnings(
        options.profile,
        activeSlacking.startTime,
        new Date(safeSyncedAt),
        options.workRecords,
        options.attendanceRecords,
      )

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    syncedAt: safeSyncedAt,
    validUntil,
    secondRate: finiteNonNegative(rates.second),
    workTimeline: buildWorkTimeline({
      profile: options.profile,
      workRecords: options.workRecords,
      attendanceRecords: options.attendanceRecords,
      rates,
      startAt: safeSyncedAt,
      endAt: validUntil,
    }),
    ...(slackingStartAt === null || !slackingBusinessDate
      ? {}
      : {
          slacking: {
            active: true as const,
            startAt: slackingStartAt,
            ...slackingBusinessDate,
            earnedAmountAtSync: finiteNonNegative(slackingAtSync?.earnedAmount ?? 0),
            paidSecondsAtSync: finiteNonNegative(slackingAtSync?.paidSeconds ?? 0),
          },
        }),
    ...(overtime ? { overtime } : {}),
  }
}
