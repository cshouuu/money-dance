import { calculateRates, getWorkedPaidSeconds, type SalaryProfile, type SalaryRates, type WorkMode } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, DailyWorkStatus, FlexibleWorkSettlementMode, WorkSession } from '../types'
import { getCustomAttendanceAmount, isConfiguredWorkday } from './attendance'
import { localDateWithTime, toLocalDateValue } from './form'
import { createId } from './id'
import { keys, loadJSON, saveJSON } from './storage'

export interface TodayWorkSummary {
  mode: WorkMode
  status: DailyWorkStatus
  dayType: 'work' | 'rest' | 'leave' | 'holiday'
  workedSeconds: number
  earnedAmount: number
  record?: DailyWorkRecord
  attendance?: AttendanceRecord
}

export function loadWorkRecords(): DailyWorkRecord[] {
  return loadJSON<DailyWorkRecord[]>(keys.workRecords, [])
}

export function saveWorkRecords(records: DailyWorkRecord[]): void {
  saveJSON(keys.workRecords, records)
}

export function upsertWorkRecord(records: DailyWorkRecord[], record: DailyWorkRecord): DailyWorkRecord[] {
  const index = records.findIndex(item => item.date === record.date)
  if (index < 0) return [record, ...records]
  return records.map((item, itemIndex) => itemIndex === index ? record : item)
}

export function getWorkRecord(records: DailyWorkRecord[], date: string): DailyWorkRecord | undefined {
  return records.find(record => record.date === date)
}

export function getFlexibleWorkedSeconds(record: DailyWorkRecord, now = new Date(), maximum = Number.POSITIVE_INFINITY): number {
  let total = 0
  for (const session of record.sessions) {
    const start = new Date(session.startTime)
    const end = session.endTime ? new Date(session.endTime) : now
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    total += Math.max(0, (end.getTime() - start.getTime()) / 1000)
  }
  return Math.min(maximum, total)
}

export function getFlexibleEarnedAmount(
  record: DailyWorkRecord,
  rates: SalaryRates,
  salaryType: SalaryProfile['salaryType'],
  now = new Date(),
): number {
  if (salaryType !== 'hourly' && record.status === 'ended' && record.settlementMode === 'full-day') return rates.daily
  return getFlexibleWorkedSeconds(record, now, rates.paidSecondsPerDay) * rates.second
}

export function getAutomaticFlexibleSettlementMode(
  salaryType: SalaryProfile['salaryType'],
  workedSeconds: number,
  paidSecondsPerDay: number,
  hasAttendancePayOverride = false,
): FlexibleWorkSettlementMode | null {
  if (salaryType === 'hourly') return 'actual'
  if (workedSeconds >= paidSecondsPerDay) return 'full-day'
  if (hasAttendancePayOverride) return 'actual'
  return null
}

export function summarizeTodayWork(profile: SalaryProfile, records: DailyWorkRecord[], now = new Date(), providedRates?: SalaryRates, attendanceRecords: AttendanceRecord[] = []): TodayWorkSummary {
  const today = toLocalDateValue(now)
  const record = getWorkRecord(records, today)
  const attendance = attendanceRecords.find(item => item.date === today)
  const mode = record?.mode ?? profile.defaultWorkMode
  const rates = providedRates ?? calculateRates(profile)
  const customAttendanceAmount = getCustomAttendanceAmount(attendance, rates.daily)

  if (attendance?.status === 'leave' || attendance?.status === 'holiday') {
    return {
      mode,
      status: 'ended',
      dayType: attendance.status,
      workedSeconds: 0,
      earnedAmount: customAttendanceAmount ?? 0,
      record,
      attendance,
    }
  }

  const scheduledWorkday = record?.mode === 'scheduled'
    || attendance?.status === 'normal'
    || isConfiguredWorkday(now, profile)
  if (mode === 'scheduled' && !scheduledWorkday) {
    return {
      mode,
      status: 'ready',
      dayType: 'rest',
      workedSeconds: 0,
      earnedAmount: 0,
      record,
      attendance,
    }
  }

  const workedSeconds = mode === 'flexible'
    ? record ? getFlexibleWorkedSeconds(record, now, rates.paidSecondsPerDay) : 0
    : getWorkedPaidSeconds(profile, now)
  const automaticEarnedAmount = mode === 'flexible' && record
    ? getFlexibleEarnedAmount(record, rates, profile.salaryType, now)
    : workedSeconds * rates.second
  return {
    mode,
    status: mode === 'flexible' ? record?.status ?? 'ready' : 'working',
    dayType: 'work',
    workedSeconds,
    earnedAmount: attendance?.status === 'normal' && customAttendanceAmount !== null ? customAttendanceAmount : automaticEarnedAmount,
    record,
    attendance,
  }
}

export function startFlexibleWork(date: string, time: string, current?: DailyWorkRecord): DailyWorkRecord {
  const session: WorkSession = { id: createId(), startTime: localDateWithTime(date, time).toISOString() }
  return {
    date,
    mode: 'flexible',
    status: 'working',
    sessions: [...(current?.mode === 'flexible' ? current.sessions.filter(item => item.endTime) : []), session],
    updatedAt: new Date().toISOString(),
  }
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

export function resumeFlexibleWork(record: DailyWorkRecord, now = new Date()): DailyWorkRecord {
  return {
    ...record,
    status: 'working',
    sessions: [...record.sessions, { id: createId(), startTime: now.toISOString() }],
    settlementMode: undefined,
    updatedAt: now.toISOString(),
  }
}

export function replaceFlexibleWorkTime(date: string, startTime: string, endTime?: string): DailyWorkRecord {
  const start = localDateWithTime(date, startTime)
  const end = endTime ? localDateWithTime(date, endTime) : undefined
  return {
    date,
    mode: 'flexible',
    status: end ? 'ended' : 'working',
    sessions: [{ id: createId(), startTime: start.toISOString(), endTime: end?.toISOString() }],
    updatedAt: new Date().toISOString(),
  }
}

export function scheduledOverride(date: string): DailyWorkRecord {
  return { date, mode: 'scheduled', status: 'ended', sessions: [], updatedAt: new Date().toISOString() }
}
