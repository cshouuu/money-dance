import { attendanceRosterShifts, rosterDayLabel, shiftDuration } from './roster'
import { getShiftBreaks, vacationForDate, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import type { TodayWorkSummary } from './work'
import { chinaHolidayForDate, resolveAttendanceDay, type ChinaHolidaySettings } from './attendance'
import { localDateWithTime, toLocalDateValue, toLocalTimeValue } from './form'
import { shiftSessionLocalDate } from './sessionBusinessDate'
import { upcomingVacations } from './vacations'

export function countdownClock(target: Date, now: Date): string {
  const seconds = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(' : ')
}

export function getRestCountdown(profile: SalaryProfile, work: TodayWorkSummary, now: Date, attendance: AttendanceRecord[], records: DailyWorkRecord[], settings: ChinaHolidaySettings) {
  const today = toLocalDateValue(now)
  const start = work.rosterStart ? new Date(work.rosterStart) : localDateWithTime(work.businessDate, profile.workStartTime)
  const shiftEnd = work.rosterEnd ? new Date(work.rosterEnd) : localDateWithTime(work.businessDate, profile.workEndTime)
  if (shiftEnd <= start) shiftEnd.setDate(shiftEnd.getDate() + 1)
  const selectedEnd = work.record?.status === 'ended' ? work.record.sessions.at(-1)?.endTime ?? work.record.plannedEndTime : work.record?.plannedEndTime
  const end = selectedEnd ? new Date(selectedEnd) : work.mode === 'scheduled' ? shiftEnd : null
  const ended = work.status === 'ended' || !!(end && end <= now)
  const active = work.dayType === 'work' && !ended && work.status !== 'ready'
  const rosterShifts = attendanceRosterShifts(profile,work.businessDate,attendance,settings)
  const rosterBreaks = rosterShifts.flatMap(shift=>shift.breaks.map(rest=>({name:rest.name,start:new Date(+localDateWithTime(work.businessDate,shift.startTime)+rest.startMinute*60000),end:new Date(+localDateWithTime(work.businessDate,shift.startTime)+rest.endMinute*60000)})))
  for(let index=1;index<rosterShifts.length;index++){const previous=rosterShifts[index-1];const from=new Date(+localDateWithTime(work.businessDate,previous.startTime)+shiftDuration(previous)*1000);const to=localDateWithTime(work.businessDate,rosterShifts[index].startTime);if(to>from)rosterBreaks.push({name:'班间休息',start:from,end:to})}
  const periods = work.rosterName ? rosterBreaks.sort((a,b)=>+a.start-+b.start) : work.mode === 'scheduled' ? getShiftBreaks(profile).map(period => ({
    name: period.name,
    start: new Date(start.getTime() + period.start * 1000),
    end: new Date(Math.min(start.getTime() + period.end * 1000, end?.getTime() ?? Infinity)),
  })).filter(period => period.start < period.end) : []
  const upcoming = active ? periods.find(period => period.end > now) : undefined
  let featured = { label: ended && work.dayType === 'work' ? '今天已下班' : work.dayType === 'work' ? '按自己的节奏工作' : '今天好好休息', target: null as Date | null, hint: '下一份期待，也在慢慢靠近' }
  if (upcoming && now < upcoming.start) featured = { label: `距离${upcoming.name}`, target: upcoming.start, hint: `${toLocalTimeValue(upcoming.start)} 开始 · 好好休息一下` }
  else if (upcoming) featured = { label: `${upcoming.name}中`, target: upcoming.end, hint: `距离${upcoming.name}结束 · 好好放松一下` }
  else if (active && end) featured = { label: '距离下班', target: end, hint: `${work.rosterEnd && toLocalDateValue(end)!==today ? `${toLocalDateValue(end)} ` : ''}${toLocalTimeValue(end)} 下班 · 忙完就好好休息` }
  else if (active) featured.hint = '设置预计结束时间后，显示下班倒计时'
  const nextBreak = upcoming
    ? { label: now < upcoming.start ? `离${upcoming.name}` : `${upcoming.name}中`, target: now < upcoming.start ? upcoming.start : upcoming.end, hint: now < upcoming.start ? `${toLocalTimeValue(upcoming.start)} 开始${upcoming.name}` : `距离${upcoming.name}结束` }
    : { label: '下一段休息', target: null, hint: work.dayType !== 'work' ? '今天好好休息' : ended ? '今天已下班' : periods.length ? '今日休息已结束' : '暂无固定休息安排' }
  let rest: { days: number; hint: string } | null = null
  let holiday: { days: number; hint: string } | null = null
  for (let days = 0; days <= 366; days++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12)
    const key = toLocalDateValue(date)
    const manual = attendance.find(item => item.date === key)
    const recorded = records.some(item => item.date === key)
    const working = manual ? resolveAttendanceDay(date, profile, manual, settings).isWorkday : recorded || (rosterDayLabel(profile,key,settings) ? rosterDayLabel(profile,key,settings)!=='排班休息' : resolveAttendanceDay(date, profile, undefined, settings).isWorkday)
    if (!rest && !working && !(key === today && active)) rest = { days, hint: `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}休息` }
    const official = chinaHolidayForDate(key, settings)
    if (!holiday && official?.kind === 'holiday') holiday = { days, hint: official.name }
    if (rest && holiday) break
  }
  let vacation: { label: string; value: string; hint: string } | null = null
  const currentVacation = vacationForDate(profile, today)
  if (currentVacation) {
    const stage = profile.workJourney?.stages.find(item => item.id === currentVacation.stageId)
    const last = stage?.endDate && stage.endDate < currentVacation.endDate ? stage.endDate : currentVacation.endDate
    let returnDate: string | null = null
    for (let offset = 1; offset <= 366; offset++) {
      const date = shiftSessionLocalDate(last, offset)
      const parsed = new Date(`${date}T12:00:00`)
      if (stage?.endDate && date > stage.endDate) break
      const manual = attendance.find(item => item.date === date)
      const resolved = resolveAttendanceDay(parsed, profile, manual, settings)
      if (resolved.isWorkday || (!manual && records.some(item => item.date === date))) { returnDate = date; break }
    }
    const days = Math.max(0, Math.round((Date.parse(last) - Date.parse(today)) / 86400000) + 1)
    vacation = { label: `${currentVacation.name}中`, value: `还剩 ${days} 天`, hint: `${last} 结束 · ${returnDate ? `${returnDate} 恢复上班` : '之后暂无上班安排'}` }
  } else {
    const upcoming = upcomingVacations(profile, today)[0]
    if (upcoming) vacation = { label: `距离${upcoming.plan.name}`, value: `${Math.round((Date.parse(upcoming.start) - Date.parse(today)) / 86400000)} 天`, hint: `${upcoming.start} 至 ${upcoming.end}` }
  }
  let nextShift: {label:string;value:string;hint:string} | null = null
  if(profile.rosters?.length) for(let offset=0;offset<=366&&!nextShift;offset++) {
    const date=shiftSessionLocalDate(today,offset)
    const manual=attendance.find(item=>item.date===date)
    if(manual && !resolveAttendanceDay(new Date(`${date}T12:00:00`),profile,manual,settings).isWorkday)continue
    for(const shift of attendanceRosterShifts(profile,date,attendance,settings)) {
      const begins=localDateWithTime(date,shift.startTime)
      if(begins>now){nextShift={label:'下一班',value:shift.name,hint:`${date} ${shift.startTime} 开始`};break}
    }
  }
  return { featured, nextBreak, nextShift, end: active ? end : null, endLabel: ended && work.dayType === 'work' ? '已下班' : work.dayType !== 'work' ? '今天休息' : '未设置', rest, holiday, vacation }
}
