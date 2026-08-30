import { CalendarClock, CalendarDays, CircleOff, Coffee } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AttendanceCalendar } from '../components/AttendanceCalendar'
import { AttendanceDialog } from '../components/AttendanceDialog'
import { loadAttendanceRecords, saveAttendanceRecords, upsertAttendanceRecord } from '../lib/attendance'
import { toLocalDateTime, toLocalDateValue } from '../lib/form'
import type { SummaryDimension } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import { loadWorkRecords } from '../lib/work'
import type { AttendanceRecord } from '../types'
import './Attendance.css'

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validRequestedDate(value: string | null): string | null {
  if (!value || !DATE_VALUE_PATTERN.test(value) || value > toLocalDateValue()) return null
  return toLocalDateValue(toLocalDateTime(value)) === value ? value : null
}

export function Attendance() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchValue = searchParams.toString()
  const requestedDateValue = searchParams.get('date')
  const requestedDate = validRequestedDate(requestedDateValue)
  const [profile] = useState(() => loadProfile())
  const [workRecords] = useState(() => loadWorkRecords())
  const [records, setRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [dimension, setDimension] = useState<SummaryDimension>('day')
  const [anchor, setAnchor] = useState(() => requestedDate ?? toLocalDateValue())
  const selectedDate = requestedDate

  useEffect(() => {
    if (requestedDate) {
      setDimension('day')
      setAnchor(requestedDate)
      return
    }
    if (requestedDateValue === null) return
    const next = new URLSearchParams(searchValue)
    next.delete('date')
    setSearchParams(next, { replace: true })
  }, [requestedDate, requestedDateValue, searchValue, setSearchParams])

  const selectedRecord = selectedDate ? records.find(record => record.date === selectedDate) : undefined
  const monthPrefix = anchor.slice(0, 7)
  const monthStats = useMemo(() => {
    const adjusted = records.filter(record => record.date.startsWith(monthPrefix))
    return {
      adjusted: adjusted.length,
      leave: adjusted.filter(record => record.status === 'leave').length,
      holiday: adjusted.filter(record => record.status === 'holiday').length,
      unpaid: adjusted.filter(record => record.status !== 'normal' && record.payMode === 'unpaid').length,
    }
  }, [records, monthPrefix])

  const closeSelectedDate = useCallback(() => {
    if (requestedDateValue === null) return
    const next = new URLSearchParams(searchValue)
    next.delete('date')
    setSearchParams(next, { replace: true })
  }, [requestedDateValue, searchValue, setSearchParams])

  const selectDate = useCallback((date: string) => {
    const next = new URLSearchParams(searchValue)
    next.set('date', date)
    setSearchParams(next, { replace: true })
  }, [searchValue, setSearchParams])

  const saveRecord = useCallback((record: AttendanceRecord) => {
    const next = upsertAttendanceRecord(records, record)
    saveAttendanceRecords(next)
    setRecords(next)
    closeSelectedDate()
  }, [closeSelectedDate, records])

  const resetRecord = useCallback(() => {
    if (!selectedDate) return
    const next = records.filter(record => record.date !== selectedDate)
    saveAttendanceRecords(next)
    setRecords(next)
    closeSelectedDate()
  }, [closeSelectedDate, selectedDate, records])

  return <section className="page attendance-page">
    <header className="page-header"><div><p className="eyebrow">ATTENDANCE & SALARY</p><h1>薪苦日历</h1><p>上班、请假还是放假，每一天都按真实出勤算钱；正常出勤也可以按倍率或固定金额调整当天工资。</p></div></header>
    <AttendanceCalendar profile={profile} records={records} workRecords={workRecords} dimension={dimension} anchor={anchor} onChange={(nextDimension, nextAnchor) => { setDimension(nextDimension); setAnchor(nextAnchor) }} onSelectDate={selectDate}/>
    <div className="attendance-stats"><article><span><CalendarDays size={17}/></span><small>本月手工调整</small><strong>{monthStats.adjusted}<i>天</i></strong></article><article><span><CalendarClock size={17}/></span><small>本月请假 / 特殊出勤</small><strong>{monthStats.leave}<i>天</i></strong></article><article><span><Coffee size={17}/></span><small>本月放假</small><strong>{monthStats.holiday}<i>天</i></strong></article><article><span><CircleOff size={17}/></span><small>本月不计薪</small><strong>{monthStats.unpaid}<i>天</i></strong></article></div>
    <p className="attendance-help">没有手工调整的日期，会继续按照你的默认上班方式和每周工作天数自动计算。倍率与固定金额按整天工资覆盖，真实工作时长仍会保留。</p>
    <AttendanceDialog open={selectedDate !== null} date={selectedDate ?? toLocalDateValue()} record={selectedRecord} onSave={saveRecord} onReset={resetRecord} onCancel={closeSelectedDate}/>
  </section>
}
