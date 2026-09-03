import { calculateRates, getWorkedPaidSeconds, parseClock, type SalaryProfile, type SalaryRates, type WorkMode } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, DailyWorkStatus, FlexibleWorkSettlementMode, WorkSession } from '../types'
import { attendanceLeavePeriod, chinaHolidayForDate, getCustomAttendanceAmount, getOfficialHolidayPayAmount, isConfiguredWorkday, isHalfDayLeave, loadChinaHolidaySettings } from './attendance'
import { localDateWithTime, toLocalDateTime, toLocalDateValue } from './form'
import { createId } from './id'
import { salaryProfileForBusinessDate } from './profile'
import { keys, loadRecordArray, saveJSON } from './storage'

export interface TodayWorkSummary {
  mode: WorkMode
  status: DailyWorkStatus
  dayType: 'work' | 'rest' | 'leave' | 'holiday'
  workedSeconds: number
  earnedAmount: number
  businessDate: string
  record?: DailyWorkRecord
  attendance?: AttendanceRecord
  officialHolidayName?: string
}

export type FlexibleSettlementRequirement = 'under-target' | 'target-reached' | 'over-target'

export interface FlexibleWorkSegment {
  startTime: string
  endTime: string
}

export interface FlexibleOvertimeWindow {
  startTime: string
  endTime: string
  durationSeconds: number
  segments: FlexibleWorkSegment[]
}

export function loadWorkRecords(): DailyWorkRecord[] {
  return loadRecordArray<DailyWorkRecord>(keys.workRecords, record => (
    typeof record.date === 'string'
    && (record.mode === 'scheduled' || record.mode === 'flexible')
    && (record.status === 'ready' || record.status === 'working' || record.status === 'paused' || record.status === 'ended')
    && Array.isArray(record.sessions)
    && record.sessions.every(session => (
      typeof session === 'object' && session !== null
      && typeof (session as { id?: unknown }).id === 'string'
      && typeof (session as { startTime?: unknown }).startTime === 'string'
      && ((session as { endTime?: unknown }).endTime === undefined || typeof (session as { endTime?: unknown }).endTime === 'string')
    ))
  ))
}

export function saveWorkRecords(records: DailyWorkRecord[]): boolean {
  return saveJSON(keys.workRecords, records)
}

export type FlexibleOvertimeCommitStage = 'overtime-session' | 'ledger' | 'achievement' | 'work-record'

export interface FlexibleOvertimeCommitWrites {
  saveOvertimeSession: () => boolean
  saveLedger: () => boolean
  saveAchievement: () => boolean
  saveWorkRecord: () => boolean
}

export interface FlexibleWorkCorrectionWrites {
  removeLinkedOvertime: () => boolean
  saveWorkRecord: () => boolean
}

/** Keeps a failed start in the dialog instead of treating it as persisted. */
export function commitFlexibleWorkStart(saveWorkRecord: () => boolean): boolean {
  try {
    return saveWorkRecord()
  } catch {
    return false
  }
}

/** Writes the frozen-work settlement in recoverable order. The work record is
 * finalized last, so any earlier failure leaves the stable-ID settlement
 * pending and safe to retry. */
export function commitFlexibleOvertimeSettlement(writes: FlexibleOvertimeCommitWrites): { success: true } | { success: false; stage: FlexibleOvertimeCommitStage } {
  const stages: Array<[FlexibleOvertimeCommitStage, () => boolean]> = [
    ['overtime-session', writes.saveOvertimeSession],
    ['ledger', writes.saveLedger],
    ['achievement', writes.saveAchievement],
    ['work-record', writes.saveWorkRecord],
  ]
  for (const [stage, write] of stages) {
    try {
      if (!write()) return { success: false, stage }
    } catch {
      return { success: false, stage }
    }
  }
  return { success: true }
}

/** A corrected active shift may only replace the settled work record after
 * its previously derived overtime has been removed. Keeping that order avoids
 * an active record coexisting with stale overtime after a storage failure. */
export function commitFlexibleWorkCorrection(writes: FlexibleWorkCorrectionWrites): { success: true } | { success: false; stage: 'overtime-cleanup' | 'work-record' } {
  try {
    if (!writes.removeLinkedOvertime()) return { success: false, stage: 'overtime-cleanup' }
  } catch {
    return { success: false, stage: 'overtime-cleanup' }
  }
  try {
    if (!writes.saveWorkRecord()) return { success: false, stage: 'work-record' }
  } catch {
    return { success: false, stage: 'work-record' }
  }
  return { success: true }
}

export function upsertWorkRecord(records: DailyWorkRecord[], record: DailyWorkRecord): DailyWorkRecord[] {
  const index = records.findIndex(item => item.date === record.date)
  if (index < 0) return [record, ...records]
  return records.map((item, itemIndex) => itemIndex === index ? record : item)
}

export function getWorkRecord(records: DailyWorkRecord[], date: string): DailyWorkRecord | undefined {
  return records.find(record => record.date === date)
}

/**
 * A fixed overnight shift belongs to the local date on which that shift
 * started. The previous business date remains active after the shift ends and
 * until the next scheduled start, matching getWorkedPaidSeconds' completed-day
 * amount during the between-shift interval.
 */
export function getScheduledBusinessDate(profile: SalaryProfile, now = new Date()): string {
  const today = toLocalDateValue(now)
  let startClock: number
  let endClock: number
  try {
    startClock = parseClock(profile.workStartTime)
    endClock = parseClock(profile.workEndTime)
  } catch {
    return today
  }
  if (endClock >= startClock) return today
  const nowClock = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  if (nowClock >= startClock) return today
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
  return toLocalDateValue(previous)
}

/** Keeps a flexible shift visible across midnight until it is ended and
 * settled. Its salary and any derived overtime remain attributed to start day. */
export function getCurrentWorkRecord(records: DailyWorkRecord[], now = new Date()): DailyWorkRecord | undefined {
  const today = toLocalDateValue(now)
  const carried = records
    .filter(record => record.date !== today
      && record.mode === 'flexible'
      && (record.status === 'working' || record.status === 'paused' || record.settlementPending))
    .filter(record => {
      const firstStart = record.sessions[0]?.startTime
      return firstStart !== undefined && new Date(firstStart) <= now
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]
  return carried ?? getWorkRecord(records, today)
}

export function getFlexibleWorkedSeconds(record: DailyWorkRecord, now = new Date(), maximum = Number.POSITIVE_INFINITY): number {
  let total = 0
  const plannedEnd = record.plannedEndTime ? new Date(record.plannedEndTime) : null
  for (const session of record.sessions) {
    const start = new Date(session.startTime)
    const activeEnd = plannedEnd && !Number.isNaN(plannedEnd.getTime()) && plannedEnd < now ? plannedEnd : now
    const end = session.endTime ? new Date(session.endTime) : activeEnd
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    total += Math.max(0, (end.getTime() - start.getTime()) / 1000)
  }
  return Math.min(maximum, total)
}

function completedFlexibleSegments(record: DailyWorkRecord, now: Date): Array<FlexibleWorkSegment & { start: Date; end: Date; durationSeconds: number }> {
  const plannedEnd = record.plannedEndTime ? new Date(record.plannedEndTime) : null
  return record.sessions.flatMap(session => {
    const start = new Date(session.startTime)
    const activeEnd = plannedEnd && !Number.isNaN(plannedEnd.getTime()) && plannedEnd < now ? plannedEnd : now
    const end = session.endTime ? new Date(session.endTime) : activeEnd
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
    return [{
      start,
      end,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationSeconds: (end.getTime() - start.getTime()) / 1000,
    }]
  })
}

export function hasFlexiblePlannedEndReached(record: DailyWorkRecord, now = new Date()): boolean {
  if ((record.status !== 'working' && record.status !== 'paused') || !record.plannedEndTime) return false
  const plannedEnd = new Date(record.plannedEndTime)
  return !Number.isNaN(plannedEnd.getTime()) && plannedEnd <= now
}

export function getFlexibleSettlementRequirement(workedSeconds: number, paidSecondsPerDay: number): FlexibleSettlementRequirement {
  const worked = Math.floor(Math.max(0, Number.isFinite(workedSeconds) ? workedSeconds : 0))
  const target = Math.floor(Math.max(0, Number.isFinite(paidSecondsPerDay) ? paidSecondsPerDay : 0))
  if (worked < target) return 'under-target'
  if (worked === target) return 'target-reached'
  return 'over-target'
}

/** Returns only the actually worked portions after the daily target was met.
 * Keeping segments separate prevents pauses from leaking into overtime. */
export function getFlexibleOvertimeWindow(
  record: DailyWorkRecord,
  paidSecondsPerDay: number,
  now = new Date(),
): FlexibleOvertimeWindow | null {
  const target = Math.max(0, Number.isFinite(paidSecondsPerDay) ? paidSecondsPerDay : 0)
  let remainingBaseSeconds = target
  const segments: FlexibleWorkSegment[] = []

  for (const segment of completedFlexibleSegments(record, now)) {
    if (remainingBaseSeconds >= segment.durationSeconds) {
      remainingBaseSeconds -= segment.durationSeconds
      continue
    }
    const overtimeStartsAfterSeconds = Math.max(0, remainingBaseSeconds)
    const overtimeStart = new Date(segment.start.getTime() + overtimeStartsAfterSeconds * 1000)
    if (segment.end > overtimeStart) {
      segments.push({ startTime: overtimeStart.toISOString(), endTime: segment.endTime })
    }
    remainingBaseSeconds = 0
  }

  if (segments.length === 0) return null
  const durationSeconds = segments.reduce((total, segment) => (
    total + Math.max(0, (new Date(segment.endTime).getTime() - new Date(segment.startTime).getTime()) / 1000)
  ), 0)
  if (durationSeconds <= 0) return null
  return {
    startTime: segments[0].startTime,
    endTime: segments.at(-1)?.endTime ?? segments[0].endTime,
    durationSeconds,
    segments,
  }
}

export function getFlexibleEarnedAmount(
  record: DailyWorkRecord,
  rates: SalaryRates,
  salaryType: SalaryProfile['salaryType'],
  now = new Date(),
): number {
  if (isFlexibleFullDaySettlement(record, salaryType)) return rates.daily
  return getFlexibleWorkedSeconds(record, now, rates.paidSecondsPerDay) * rates.second
}

/** Base salary shown before excess flexible time is converted to overtime.
 * Full-day unpaid leave/holiday has an explicit zero base; a null custom
 * amount only falls back to daily salary for normal attendance. */
export function getFlexibleBaseSettlementAmount(attendance: AttendanceRecord | undefined, dailyAmount: number): number {
  const customAmount = getCustomAttendanceAmount(attendance, dailyAmount)
  if (customAmount !== null) return customAmount
  if (attendance?.status === 'leave' || attendance?.status === 'holiday') return 0
  return Math.max(0, dailyAmount)
}

export function isFlexibleFullDaySettlement(record: DailyWorkRecord | undefined, salaryType: SalaryProfile['salaryType']): boolean {
  if (!record || record.status !== 'ended' || record.settlementMode !== 'full-day') return false
  return salaryType !== 'hourly' || record.settlementVersion === 2
}

export function getAutomaticFlexibleSettlementMode(
  salaryType: SalaryProfile['salaryType'],
  workedSeconds: number,
  paidSecondsPerDay: number,
  hasAttendancePayOverride = false,
): FlexibleWorkSettlementMode | null {
  const requirement = getFlexibleSettlementRequirement(workedSeconds, paidSecondsPerDay)
  if (requirement === 'over-target') return null
  if (requirement === 'target-reached') return 'full-day'
  if (hasAttendancePayOverride) return 'actual'
  // Salary type is intentionally not used to skip this choice: even hourly
  // users may explicitly settle a short day at their configured target hours.
  void salaryType
  return null
}

export function summarizeTodayWork(profile: SalaryProfile, records: DailyWorkRecord[], now = new Date(), _providedRates?: SalaryRates, attendanceRecords: AttendanceRecord[] = []): TodayWorkSummary {
  const today = toLocalDateValue(now)
  const record = getCurrentWorkRecord(records, now)
  const mode = record?.mode ?? profile.defaultWorkMode
  const businessDate = record?.date ?? (mode === 'scheduled' ? getScheduledBusinessDate(profile, now) : today)
  const attendance = attendanceRecords.find(item => item.date === businessDate)
  const holidaySettings = loadChinaHolidaySettings(now)
  const datedProfile = salaryProfileForBusinessDate(profile, businessDate, attendanceRecords, holidaySettings)
  const rates = calculateRates(datedProfile)
  const customAttendanceAmount = getCustomAttendanceAmount(attendance, rates.daily)

  if ((attendance?.status === 'leave' && !isHalfDayLeave(attendance)) || attendance?.status === 'holiday') {
    return {
      mode,
      status: 'ended',
      dayType: attendance.status,
      workedSeconds: 0,
      earnedAmount: customAttendanceAmount ?? 0,
      businessDate,
      record,
      attendance,
    }
  }

  const officialHoliday = attendance || record ? undefined : chinaHolidayForDate(businessDate, holidaySettings)
  const officialHolidayAmount = attendance || record ? null : getOfficialHolidayPayAmount(businessDate, datedProfile, rates.daily, holidaySettings)
  if (officialHolidayAmount !== null) {
    return {
      mode,
      status: 'ended',
      dayType: 'holiday',
      workedSeconds: 0,
      earnedAmount: officialHolidayAmount,
      businessDate,
      record,
      officialHolidayName: officialHoliday?.name,
    }
  }

  const scheduledWorkday = record?.mode === 'scheduled'
    || attendance?.status === 'normal'
    || isHalfDayLeave(attendance)
    || isConfiguredWorkday(toLocalDateTime(businessDate), profile, holidaySettings)
  if (mode === 'scheduled' && !scheduledWorkday) {
    return {
      mode,
      status: 'ready',
      dayType: 'rest',
      workedSeconds: 0,
      earnedAmount: 0,
      businessDate,
      record,
      attendance,
    }
  }

  const automaticScheduledSeconds = getWorkedPaidSeconds(profile, now)
  const halfDayTarget = rates.paidSecondsPerDay * 0.5
  const workedSeconds = mode === 'flexible'
    ? record ? getFlexibleWorkedSeconds(record, now) : 0
    : isHalfDayLeave(attendance)
      ? attendanceLeavePeriod(attendance) === 'morning'
        ? Math.max(0, Math.min(halfDayTarget, automaticScheduledSeconds - halfDayTarget))
        : Math.min(halfDayTarget, automaticScheduledSeconds)
      : automaticScheduledSeconds
  const automaticEarnedAmount = mode === 'flexible' && record
    ? getFlexibleEarnedAmount(record, rates, datedProfile.salaryType, now)
    : workedSeconds * rates.second
  return {
    mode,
    status: mode === 'flexible'
      ? record && hasFlexiblePlannedEndReached(record, now) ? 'ended' : record?.status ?? 'ready'
      : 'working',
    dayType: 'work',
    workedSeconds,
    businessDate,
    earnedAmount: (attendance?.status === 'normal' || isHalfDayLeave(attendance)) && customAttendanceAmount !== null
      ? customAttendanceAmount
      : automaticEarnedAmount,
    record,
    attendance,
  }
}

export function startFlexibleWork(date: string, time: string, current?: DailyWorkRecord, plannedEndTime?: string): DailyWorkRecord {
  const session: WorkSession = { id: createId(), startTime: localDateWithTime(date, time).toISOString() }
  return {
    date,
    mode: 'flexible',
    status: 'working',
    sessions: [...(current?.mode === 'flexible' ? current.sessions.filter(item => item.endTime) : []), session],
    ...(plannedEndTime ? { plannedEndTime } : {}),
    updatedAt: new Date().toISOString(),
  }
}

/** Flexible starts may be backfilled up to the current minute, but never
 * scheduled into the future. Shared validation keeps quick actions and the
 * manual form on the same rule. */
export function isFlexibleStartTimeAllowed(date: string, time: string, now = new Date()): boolean {
  const start = localDateWithTime(date, time)
  return !Number.isNaN(start.getTime()) && start <= now
}

/** Returns undefined when no planned stop was requested, null for an invalid
 * stop, and an ISO timestamp for a valid future stop. */
export function resolveFlexiblePlannedEndTime(
  date: string,
  startTime: string,
  plannedEndDate: string,
  plannedEndTime: string,
  now = new Date(),
): string | null | undefined {
  if (!plannedEndTime) return undefined
  const planned = localDateWithTime(plannedEndDate, plannedEndTime)
  const started = localDateWithTime(date, startTime)
  if (Number.isNaN(planned.getTime()) || Number.isNaN(started.getTime()) || planned <= started || planned <= now) return null
  return planned.toISOString()
}

export function closeActiveWorkSession(
  record: DailyWorkRecord,
  status: 'paused' | 'ended',
  now = new Date(),
  settlementMode: FlexibleWorkSettlementMode = 'actual',
): DailyWorkRecord {
  return {
    ...record,
    status,
    sessions: record.sessions.map(session => session.endTime ? session : { ...session, endTime: now.toISOString() }),
    settlementMode: status === 'ended' ? settlementMode : undefined,
    updatedAt: now.toISOString(),
  }
}

/** Ends the active interval immediately, while leaving the salary decision
 * pending. This record is safe to persist before opening the settlement UI. */
export function freezeFlexibleWorkForSettlement(record: DailyWorkRecord, now = new Date()): DailyWorkRecord {
  const plannedEnd = record.plannedEndTime ? new Date(record.plannedEndTime) : null
  const effectiveEnd = plannedEnd && !Number.isNaN(plannedEnd.getTime()) && plannedEnd < now ? plannedEnd : now
  const frozen = closeActiveWorkSession(record, 'ended', effectiveEnd, 'actual')
  return {
    ...frozen,
    settlementMode: undefined,
    settlementPending: true,
    settlementVersion: 2,
    overtimeSessionId: record.overtimeSessionId ?? createId(),
  }
}

export function settleFlexibleWorkRecord(record: DailyWorkRecord, settlementMode: FlexibleWorkSettlementMode): DailyWorkRecord {
  return {
    ...record,
    status: 'ended',
    settlementMode,
    settlementPending: false,
    settlementVersion: 2,
    updatedAt: new Date().toISOString(),
  }
}

export function resumeFlexibleWork(record: DailyWorkRecord, now = new Date()): DailyWorkRecord {
  const plannedEnd = record.plannedEndTime ? new Date(record.plannedEndTime) : null
  const futurePlannedEndTime = plannedEnd && !Number.isNaN(plannedEnd.getTime()) && plannedEnd > now
    ? record.plannedEndTime
    : undefined
  return {
    ...record,
    status: 'working',
    sessions: [...record.sessions, { id: createId(), startTime: now.toISOString() }],
    settlementMode: undefined,
    settlementPending: false,
    plannedEndTime: futurePlannedEndTime,
    updatedAt: now.toISOString(),
  }
}

export function replaceFlexibleWorkTime(date: string, startTime: string, endTime?: string, endDate = date, current?: DailyWorkRecord): DailyWorkRecord {
  const start = localDateWithTime(date, startTime)
  const end = endTime ? localDateWithTime(endDate, endTime) : undefined
  return {
    date,
    mode: 'flexible',
    status: end ? 'ended' : 'working',
    sessions: [{ id: createId(), startTime: start.toISOString(), endTime: end?.toISOString() }],
    ...(current?.overtimeSessionId ? { overtimeSessionId: current.overtimeSessionId } : {}),
    updatedAt: new Date().toISOString(),
  }
}

export function scheduledOverride(date: string): DailyWorkRecord {
  return { date, mode: 'scheduled', status: 'ended', sessions: [], updatedAt: new Date().toISOString() }
}
