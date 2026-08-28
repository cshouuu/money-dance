import type { SalaryProfile } from '@salary-flow/core'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { getSummaryRange, summarizeLedger, type SummaryDimension } from '../lib/ledger'
import { toLocalDateValue, toLocalMonthValue } from '../lib/form'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import './LedgerCalendar.css'

interface LedgerCalendarProps {
  profile: SalaryProfile
  ledger: LedgerEntry[]
  workRecords: DailyWorkRecord[]
  attendanceRecords: AttendanceRecord[]
  dimension: SummaryDimension
  anchor: string
  onChange: (dimension: SummaryDimension, anchor: string) => void
}

interface CalendarCell {
  key: string
  label: string
  anchor: string
  net: number
  current?: boolean
}

const dimensions: { value: SummaryDimension; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

function netClass(value: number): string {
  if (value > 0.004) return 'positive'
  if (value < -0.004) return 'negative'
  return 'zero'
}

function formatNet(value: number): string {
  if (Math.abs(value) < 0.005) return '0.00'
  const amount = Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${value > 0 ? '+' : '−'}${amount}`
}

function anchorForDimension(next: SummaryDimension, current: SummaryDimension, anchor: string, now: Date): string {
  if (next === current) return anchor
  if (next === 'year') return anchor.slice(0, 4)
  if (next === 'month') {
    if (current === 'day') return anchor.slice(0, 7)
    const year = Number(anchor)
    return year === now.getFullYear() ? toLocalMonthValue(now) : `${year}-01`
  }
  if (current === 'month') {
    return anchor === toLocalMonthValue(now) ? toLocalDateValue(now) : `${anchor}-01`
  }
  const year = Number(anchor)
  return year === now.getFullYear() ? toLocalDateValue(now) : `${year}-01-01`
}

export function LedgerCalendar({ profile, ledger, workRecords, attendanceRecords, dimension, anchor, onChange }: LedgerCalendarProps) {
  const now = new Date()
  const today = toLocalDateValue(now)
  const selectedMonth = dimension === 'day' ? anchor.slice(0, 7) : dimension === 'month' ? anchor : `${anchor}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const selectedYear = Number(anchor.slice(0, 4))

  const cellNet = (cellDimension: SummaryDimension, cellAnchor: string) => {
    const { start, end } = getSummaryRange(cellDimension, cellAnchor)
    return summarizeLedger(profile, ledger, start, end, now, workRecords, attendanceRecords).net
  }

  const dayCells = useMemo<(CalendarCell | null)[]>(() => {
    if (dimension !== 'day') return []
    const [year, month] = selectedMonth.split('-').map(Number)
    const firstDay = new Date(year, month - 1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells: (CalendarCell | null)[] = Array.from({ length: firstDay }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateAnchor = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      cells.push({ key: dateAnchor, label: String(day), anchor: dateAnchor, net: cellNet('day', dateAnchor), current: dateAnchor === today })
    }
    return cells
  }, [dimension, selectedMonth, profile, ledger, workRecords, attendanceRecords, today])

  const monthCells = useMemo<CalendarCell[]>(() => {
    if (dimension !== 'month') return []
    return Array.from({ length: 12 }, (_, index) => {
      const monthAnchor = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
      return { key: monthAnchor, label: `${index + 1}月`, anchor: monthAnchor, net: cellNet('month', monthAnchor), current: monthAnchor === toLocalMonthValue(now) }
    })
  }, [dimension, selectedYear, profile, ledger, workRecords, attendanceRecords])

  const yearCells = useMemo<CalendarCell[]>(() => {
    if (dimension !== 'year') return []
    const rangeStart = selectedYear - 6
    return Array.from({ length: 7 }, (_, index) => {
      const value = rangeStart + index
      const yearAnchor = String(value)
      return { key: yearAnchor, label: value === now.getFullYear() ? '本年' : `${value}年`, anchor: yearAnchor, net: cellNet('year', yearAnchor), current: value === now.getFullYear() }
    })
  }, [dimension, selectedYear, profile, ledger, workRecords, attendanceRecords])

  const navigate = (direction: -1 | 1) => {
    if (dimension === 'day') {
      const [year, month] = selectedMonth.split('-').map(Number)
      const next = new Date(year, month - 1 + direction, 1)
      const nextMonth = toLocalMonthValue(next)
      const nextAnchor = nextMonth === toLocalMonthValue(now) ? today : `${nextMonth}-01`
      onChange('day', nextAnchor)
      return
    }
    if (dimension === 'month') {
      onChange('month', `${selectedYear + direction}-${anchor.slice(5, 7)}`)
      return
    }
    onChange('year', String(selectedYear + direction * 7))
  }

  const cells = dimension === 'day' ? dayCells : dimension === 'month' ? monthCells : yearCells
  return <section className="ledger-calendar" aria-labelledby="ledger-calendar-title">
    <div className="calendar-title-row"><div><p className="eyebrow">INCOME & EXPENSE</p><h2 id="ledger-calendar-title">收支日历</h2></div><CalendarDays size={20}/></div>
    <div className="calendar-dimension-tabs" role="group" aria-label="日历粒度">
      {dimensions.map(item => <button key={item.value} type="button" className={dimension === item.value ? 'active' : ''} aria-pressed={dimension === item.value} onClick={() => onChange(item.value, anchorForDimension(item.value, dimension, anchor, now))}>{item.label}</button>)}
    </div>
    <div className="calendar-period-nav">
      <button type="button" aria-label="上一时间段" onClick={() => navigate(-1)}><ChevronLeft size={18}/></button>
      <strong>{dimension === 'day' ? `${selectedYear}年 ${Number(selectedMonth.slice(5))}月` : dimension === 'month' ? `${selectedYear}年` : `${selectedYear - 6} — ${selectedYear}`}</strong>
      <button type="button" aria-label="下一时间段" onClick={() => navigate(1)}><ChevronRight size={18}/></button>
    </div>
    {dimension === 'day' && <div className="calendar-weekdays" aria-hidden="true">{['日','一','二','三','四','五','六'].map(day => <span key={day}>{day}</span>)}</div>}
    <div className={`calendar-grid ${dimension}`}>
      {cells.map((cell, index) => cell ? <button key={cell.key} type="button" className={`${netClass(cell.net)}${cell.anchor === anchor ? ' selected' : ''}${cell.current ? ' current' : ''}`} aria-pressed={cell.anchor === anchor} onClick={() => onChange(dimension, cell.anchor)}><b>{cell.label}</b><span>{formatNet(cell.net)}</span></button> : <span className="calendar-empty-cell" key={`empty-${index}`}/>) }
    </div>
    <div className="calendar-legend"><span><i className="income"/>收入结余</span><span><i className="expense"/>支出结余</span><span>点击日期查看明细</span></div>
  </section>
}
