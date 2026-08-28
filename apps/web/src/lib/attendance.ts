import type { AttendanceRecord, LeaveType } from '../types'
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

export function isConfiguredWorkday(date: Date, workDaysPerWeek: number): boolean {
  const normalized = Math.min(7, Math.max(1, Math.round(workDaysPerWeek)))
  const mondayBasedIndex = (date.getDay() + 6) % 7
  return mondayBasedIndex < normalized
}
