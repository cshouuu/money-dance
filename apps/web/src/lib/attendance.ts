import type { AlternatingWeekType, SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, LeaveType } from '../types'
import { toLocalDateTime, toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'personal', label: '事假' },
  { value: 'sick', label: '病假' },
  { value: 'annual', label: '年假' },
  { value: 'compensatory', label: '调休' },
  { value: 'marriage', label: '婚假' },
  { value: 'maternity', label: '产假' },
  { value: 'prenatal', label: '产检假' },
  { value: 'paternity', label: '陪产假' },
  { value: 'parental', label: '育儿假' },
  { value: 'bereavement', label: '丧假' },
  { value: 'remote', label: '远程工作' },
]

export function loadAttendanceRecords(): AttendanceRecord[] {
  return loadJSON<AttendanceRecord[]>(keys.attendanceRecords, [])
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  saveJSON(keys.attendanceRecords, records)
}

export function upsertAttendanceRecord(records: AttendanceRecord[], record: AttendanceRecord): AttendanceRecord[] {
  const existing = records.some(item => item.date === record.date)
  return existing
    ? records.map(item => item.date === record.date ? record : item)
    : [record, ...records]
}

export function leaveTypeLabel(type?: LeaveType): string {
  return LEAVE_TYPES.find(item => item.value === type)?.label ?? '请假'
}

function weekStart(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const mondayBasedIndex = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - mondayBasedIndex)
  return result
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

export function getWeekStartDateValue(date = new Date()): string {
  return toLocalDateValue(weekStart(date))
}

export function alternatingWeekTypeForDate(date: Date, profile: SalaryProfile): AlternatingWeekType {
  const parsedAnchor = toLocalDateTime(profile.alternatingAnchorDate)
  const anchor = Number.isNaN(parsedAnchor.getTime()) ? weekStart(date) : weekStart(parsedAnchor)
  const target = weekStart(date)
  const difference = Math.round((calendarDayNumber(target) - calendarDayNumber(anchor)) / 7)
  const sameParity = Math.abs(difference) % 2 === 0
  const anchorType = profile.alternatingAnchorType === 'small' ? 'small' : 'big'
  if (sameParity) return anchorType
  return anchorType === 'big' ? 'small' : 'big'
}

export function isConfiguredWorkday(date: Date, profile: SalaryProfile): boolean {
  const mondayBasedIndex = (date.getDay() + 6) % 7
  if (profile.workWeekMode === 'alternating') {
    if (mondayBasedIndex < 5) return true
    if (mondayBasedIndex === 5) return alternatingWeekTypeForDate(date, profile) === 'big'
    return false
  }
  const normalized = Math.min(7, Math.max(1, Math.round(profile.workDaysPerWeek)))
  return mondayBasedIndex < normalized
}
