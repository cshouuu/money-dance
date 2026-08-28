import type { SalaryProfile } from '@salary-flow/core'
import { CalendarCheck2, ChevronLeft, ChevronRight } from 'lucide-react'
import { isConfiguredWorkday, leaveTypeLabel } from '../lib/attendance'
import { toLocalDateTime, toLocalDateValue, toLocalMonthValue } from '../lib/form'
import type { SummaryDimension } from '../lib/ledger'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import './LedgerCalendar.css'
import './AttendanceCalendar.css'

interface AttendanceCalendarProps {
  profile: SalaryProfile
  records: AttendanceRecord[]
  workRecords: DailyWorkRecord[]
  dimension: SummaryDimension
  anchor: string
  onChange: (dimension: SummaryDimension, anchor: string) => void
  onSelectDate: (date: string) => void
}

interface DayState {
  label: string
  tone: 'normal' | 'leave' | 'rest' | 'future'
  explicit: boolean
}

const dimensions: { value: SummaryDimension; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

function anchorForDimension(next: SummaryDimension, current: SummaryDimension, anchor: string, now: Date): string {
  if (next === current) return anchor
  if (next === 'year') return anchor.slice(0, 4)
  if (next === 'month') {
    if (current === 'day') return anchor.slice(0, 7)
    const year = Number(anchor)
    return year === now.getFullYear() ? toLocalMonthValue(now) : `${year}-01`
  }
  if (current === 'month') return anchor === toLocalMonthValue(now) ? toLocalDateValue(now) : `${anchor}-01`
  const year = Number(anchor)
  return year === now.getFullYear() ? toLocalDateValue(now) : `${year}-01-01`
}

export function AttendanceCalendar({ profile, records, workRecords, dimension, anchor, onChange, onSelectDate }: AttendanceCalendarProps) {
  const now = new Date()
  const today = toLocalDateValue(now)
  const selectedMonth = dimension === 'day' ? anchor.slice(0, 7) : dimension === 'month' ? anchor : `${anchor}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const selectedYear = Number(anchor.slice(0, 4))
  const recordByDate = new Map(records.map(record => [record.date, record]))
  const workedDates = new Set(workRecords.filter(record => record.sessions.length > 0 || record.mode === 'scheduled').map(record => record.date))

  const stateForDate = (date: string): DayState => {
    if (date > today) return { label: '未到', tone: 'future', explicit: false }
    const record = recordByDate.get(date)
    if (record?.status === 'normal') return { label: '正常', tone: 'normal', explicit: true }
    if (record?.status === 'leave') return { label: leaveTypeLabel(record.leaveType), tone: 'leave', explicit: true }
    const day = toLocalDateTime(date)
    if (workedDates.has(date) || isConfiguredWorkday(day, profile.workDaysPerWeek)) return { label: '正常', tone: 'normal', explicit: false }
    return { label: '休息', tone: 'rest', explicit: false }
  }

  const countRange = (start: Date, end: Date) => {
    let normal = 0
    let leave = 0
    for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
      const date = toLocalDateValue(cursor)
      if (date > today) break
      const state = stateForDate(date)
      if (state.tone === 'normal') normal += 1
      if (state.tone === 'leave') leave += 1
    }
    return { normal, leave }
  }

  const navigate = (direction: -1 | 1) => {
    if (dimension === 'day') {
      const [year, month] = selectedMonth.split('-').map(Number)
      const nextMonth = toLocalMonthValue(new Date(year, month - 1 + direction, 1))
      onChange('day', nextMonth === toLocalMonthValue(now) ? today : `${nextMonth}-01`)
      return
    }
    if (dimension === 'month') {
      onChange('month', `${selectedYear + direction}-${anchor.slice(5, 7)}`)
      return
    }
    onChange('year', String(selectedYear + direction * 7))
  }

  const dayCells = (() => {
    if (dimension !== 'day') return []
    const [year, month] = selectedMonth.split('-').map(Number)
    const cells: ({ date: string; day: number; state: DayState } | null)[] = Array.from({ length: new Date(year, month - 1, 1).getDay() }, () => null)
    for (let day = 1; day <= new Date(year, month, 0).getDate(); day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      cells.push({ date, day, state: stateForDate(date) })
    }
    return cells
  })()

  const monthCells = dimension === 'month' ? Array.from({ length: 12 }, (_, index) => {
    const monthAnchor = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
    return { anchor: monthAnchor, label: `${index + 1}月`, counts: countRange(new Date(selectedYear, index, 1), new Date(selectedYear, index + 1, 1)) }
  }) : []

  const yearCells = dimension === 'year' ? Array.from({ length: 7 }, (_, index) => {
    const year = selectedYear - 6 + index
    return { anchor: String(year), label: year === now.getFullYear() ? '本年' : `${year}年`, counts: countRange(new Date(year, 0, 1), new Date(year + 1, 0, 1)) }
  }) : []

  const drillDown = (cellDimension: 'month' | 'year', value: string) => {
    if (cellDimension === 'month') {
      if (value > toLocalMonthValue(now)) return
      onChange('day', value === toLocalMonthValue(now) ? today : `${value}-01`)
      return
    }
    if (Number(value) > now.getFullYear()) return
    onChange('month', Number(value) === now.getFullYear() ? toLocalMonthValue(now) : `${value}-01`)
  }

  return <section className="ledger-calendar attendance-calendar" aria-labelledby="attendance-calendar-title">
    <div className="calendar-title-row"><div><p className="eyebrow">ATTENDANCE CALENDAR</p><h2 id="attendance-calendar-title">薪苦日历</h2></div><CalendarCheck2 size={20}/></div>
    <div className="calendar-dimension-tabs" role="group" aria-label="日历粒度">{dimensions.map(item => <button key={item.value} type="button" className={dimension === item.value ? 'active' : ''} aria-pressed={dimension === item.value} onClick={() => onChange(item.value, anchorForDimension(item.value, dimension, anchor, now))}>{item.label}</button>)}</div>
    <div className="calendar-period-nav"><button type="button" aria-label="上一时间段" onClick={() => navigate(-1)}><ChevronLeft size={18}/></button><strong>{dimension === 'day' ? `${selectedYear}年 ${Number(selectedMonth.slice(5))}月` : dimension === 'month' ? `${selectedYear}年` : `${selectedYear - 6} — ${selectedYear}`}</strong><button type="button" aria-label="下一时间段" onClick={() => navigate(1)}><ChevronRight size={18}/></button></div>
    {dimension === 'day' && <><div className="calendar-weekdays" aria-hidden="true">{['日','一','二','三','四','五','六'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid day">{dayCells.map((cell, index) => cell ? <button key={cell.date} type="button" disabled={cell.state.tone === 'future'} className={`attendance-${cell.state.tone}${cell.date === anchor ? ' selected' : ''}${cell.date === today ? ' current' : ''}${cell.state.explicit ? ' explicit' : ''}`} aria-label={`${cell.date}，${cell.state.label}${cell.state.explicit ? '，已调整' : ''}`} onClick={() => { onChange('day', cell.date); onSelectDate(cell.date) }}><b>{cell.day}</b><span>{cell.state.label}</span></button> : <span className="calendar-empty-cell" key={`empty-${index}`}/>)}</div></>}
    {dimension === 'month' && <div className="calendar-grid month">{monthCells.map(cell => <button key={cell.anchor} type="button" disabled={cell.anchor > toLocalMonthValue(now)} className={cell.anchor === toLocalMonthValue(now) ? 'current' : ''} onClick={() => drillDown('month', cell.anchor)} aria-label={`${cell.label}，正常${cell.counts.normal}天，请假${cell.counts.leave}天`}><b>{cell.label}</b><span>正常 {cell.counts.normal} · 请假 {cell.counts.leave}</span></button>)}</div>}
    {dimension === 'year' && <div className="calendar-grid year">{yearCells.map(cell => <button key={cell.anchor} type="button" disabled={Number(cell.anchor) > now.getFullYear()} className={Number(cell.anchor) === now.getFullYear() ? 'current' : ''} onClick={() => drillDown('year', cell.anchor)} aria-label={`${cell.label}，正常${cell.counts.normal}天，请假${cell.counts.leave}天`}><b>{cell.label}</b><span>正常 {cell.counts.normal} · 请假 {cell.counts.leave}</span></button>)}</div>}
    <div className="calendar-legend"><span><i className="attendance-normal-dot"/>正常上班</span><span><i className="attendance-leave-dot"/>请假 / 特殊出勤</span><span>点击日期调整出勤</span></div>
  </section>
}
