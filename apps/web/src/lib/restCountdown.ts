import type { SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import type { TodayWorkSummary } from './work'
import { chinaHolidayForDate, resolveAttendanceDay, type ChinaHolidaySettings } from './attendance'
import { localDateWithTime, toLocalDateValue, toLocalTimeValue } from './form'

export function countdownClock(target: Date, now: Date): string {
  const seconds = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(' : ')
}

export function getRestCountdown(profile: SalaryProfile, work: TodayWorkSummary, now: Date, attendance: AttendanceRecord[], records: DailyWorkRecord[], settings: ChinaHolidaySettings) {
  const today = toLocalDateValue(now)
  const start = localDateWithTime(work.businessDate, profile.workStartTime)
  const shiftEnd = localDateWithTime(work.businessDate, profile.workEndTime)
  if (shiftEnd <= start) shiftEnd.setDate(shiftEnd.getDate() + 1)
  const selectedEnd = work.record?.status === 'ended' ? work.record.sessions.at(-1)?.endTime ?? work.record.plannedEndTime : work.record?.plannedEndTime
  const end = selectedEnd ? new Date(selectedEnd) : work.mode === 'scheduled' ? shiftEnd : null
  const ended = work.status === 'ended' || !!(end && end <= now)
  const active = work.dayType === 'work' && !ended && work.status !== 'ready'
  const breakStart = localDateWithTime(work.businessDate, profile.breakStartTime)
  if (breakStart < start) breakStart.setDate(breakStart.getDate() + 1)
  const breakEnd = localDateWithTime(toLocalDateValue(breakStart), profile.breakEndTime)
  if (breakEnd < breakStart) breakEnd.setDate(breakEnd.getDate() + 1)
  const hasBreak = work.mode === 'scheduled' && breakStart < breakEnd && breakStart < shiftEnd && (!end || breakStart < end)
  let featured = { label: ended && work.dayType === 'work' ? '今天已下班' : work.dayType === 'work' ? '按自己的节奏工作' : '今天好好休息', target: null as Date | null, hint: '下一份期待，也在慢慢靠近' }
  if (active && hasBreak && now < breakStart) featured = { label: '距离午休', target: breakStart, hint: `${toLocalTimeValue(breakStart)} 开始 · 好好吃顿饭` }
  else if (active && hasBreak && now < breakEnd) featured = { label: '午休中', target: new Date(Math.min(breakEnd.getTime(), end?.getTime() ?? Infinity)), hint: '距离午休结束 · 好好放松一下' }
  else if (active && end) featured = { label: '距离下班', target: end, hint: `${toLocalTimeValue(end)} 下班 · 忙完就好好休息` }
  else if (active) featured.hint = '设置预计结束时间后，显示下班倒计时'
  const lunch = active && hasBreak && now < breakEnd
    ? { label: now < breakStart ? '离午休' : '午休中', target: now < breakStart ? breakStart : new Date(Math.min(breakEnd.getTime(), end?.getTime() ?? Infinity)), hint: now < breakStart ? `${toLocalTimeValue(breakStart)} 开始午休` : '距离午休结束' }
    : { label: '离午休', target: null, hint: work.dayType !== 'work' ? '今天好好休息' : ended ? '今天已下班' : hasBreak ? '今日午休已结束' : '暂无固定午休安排' }
  let rest: { days: number; hint: string } | null = null
  let holiday: { days: number; hint: string } | null = null
  for (let days = 0; days <= 366; days++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12)
    const key = toLocalDateValue(date)
    const manual = attendance.find(item => item.date === key)
    const recorded = records.some(item => item.date === key)
    const working = manual ? resolveAttendanceDay(date, profile, manual, settings).isWorkday : recorded || resolveAttendanceDay(date, profile, undefined, settings).isWorkday
    if (!rest && !working && !(key === today && active)) rest = { days, hint: `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}休息` }
    const official = chinaHolidayForDate(key, settings)
    if (!holiday && official?.kind === 'holiday') holiday = { days, hint: official.name }
    if (rest && holiday) break
  }
  return { featured, lunch, end: active ? end : null, endLabel: ended && work.dayType === 'work' ? '已下班' : work.dayType !== 'work' ? '今天休息' : '未设置', rest, holiday }
}
