import { CalendarClock, CalendarDays, CircleOff, Coffee } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { AttendanceCalendar } from '../components/AttendanceCalendar'
import { AttendanceDialog } from '../components/AttendanceDialog'
import { loadAttendanceRecords, saveAttendanceRecords, upsertAttendanceRecord } from '../lib/attendance'
import { toLocalDateValue } from '../lib/form'
import type { SummaryDimension } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import { loadWorkRecords } from '../lib/work'
import type { AttendanceRecord } from '../types'
import './Attendance.css'

export function Attendance() {
  const [profile] = useState(() => loadProfile())
  const [workRecords] = useState(() => loadWorkRecords())
  const [records, setRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [dimension, setDimension] = useState<SummaryDimension>('day')
  const [anchor, setAnchor] = useState(() => toLocalDateValue())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  const saveRecord = useCallback((record: AttendanceRecord) => {
    const next = upsertAttendanceRecord(records, record)
    saveAttendanceRecords(next)
    setRecords(next)
    setSelectedDate(null)
  }, [records])

  const resetRecord = useCallback(() => {
    if (!selectedDate) return
    const next = records.filter(record => record.date !== selectedDate)
    saveAttendanceRecords(next)
    setRecords(next)
    setSelectedDate(null)
  }, [selectedDate, records])

  return <section className="page attendance-page">
    <header className="page-header"><div><p className="eyebrow">ATTENDANCE & SALARY</p><h1>薪苦日历</h1><p>上班、请假还是放假，每一天都按真实出勤算钱。平常无需打卡，只有特殊日期才需要调整。</p></div></header>
    <AttendanceCalendar profile={profile} records={records} workRecords={workRecords} dimension={dimension} anchor={anchor} onChange={(nextDimension, nextAnchor) => { setDimension(nextDimension); setAnchor(nextAnchor) }} onSelectDate={setSelectedDate}/>
    <div className="attendance-stats"><article><span><CalendarDays size={17}/></span><small>本月手工调整</small><strong>{monthStats.adjusted}<i>天</i></strong></article><article><span><CalendarClock size={17}/></span><small>本月请假 / 特殊出勤</small><strong>{monthStats.leave}<i>天</i></strong></article><article><span><Coffee size={17}/></span><small>本月放假</small><strong>{monthStats.holiday}<i>天</i></strong></article><article><span><CircleOff size={17}/></span><small>本月不计薪</small><strong>{monthStats.unpaid}<i>天</i></strong></article></div>
    <p className="attendance-help">没有手工调整的日期，会继续按照你的默认上班方式和每周工作天数自动计算。调整历史日期后，账本中的对应工资收入会同步重算。</p>
    <AttendanceDialog open={selectedDate !== null} date={selectedDate ?? toLocalDateValue()} record={selectedRecord} onSave={saveRecord} onReset={resetRecord} onCancel={() => setSelectedDate(null)}/>
  </section>
}
