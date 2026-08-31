import { CalendarClock, CalendarDays, CircleOff, Coffee, Landmark } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AttendanceCalendar } from '../components/AttendanceCalendar'
import { AttendanceDialog } from '../components/AttendanceDialog'
import { attendanceAdjustedDayValue, loadAttendanceRecords, loadChinaHolidaySettings, saveAttendanceRecords, saveChinaHolidaySettings, upsertAttendanceRecord } from '../lib/attendance'
import { hasChinaHolidayYear } from '../lib/chinaHolidays'
import { toLocalDateTime, toLocalDateValue } from '../lib/form'
import type { SummaryDimension } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import { loadWorkRecords } from '../lib/work'
import type { AttendanceRecord } from '../types'
import './Attendance.css'

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validRequestedDate(value: string | null): string | null {
  if (!value || !DATE_VALUE_PATTERN.test(value)) return null
  if (value > toLocalDateValue() && !hasChinaHolidayYear(Number(value.slice(0, 4)))) return null
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
  const [holidaySettings, setHolidaySettings] = useState(() => loadChinaHolidaySettings())
  const [holidaySettingsError, setHolidaySettingsError] = useState('')
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
      leave: adjusted.reduce((sum, record) => sum + (record.status === 'leave' ? attendanceAdjustedDayValue(record) : 0), 0),
      holiday: adjusted.filter(record => record.status === 'holiday').length,
      unpaid: adjusted.reduce((sum, record) => sum + (record.status !== 'normal' && record.payMode === 'unpaid' ? attendanceAdjustedDayValue(record) : 0), 0),
    }
  }, [records, monthPrefix])

  const toggleChinaHolidayCalendar = useCallback(() => {
    const next = {
      ...holidaySettings,
      enabled: !holidaySettings.enabled,
      ...(!holidaySettings.enabled ? { effectiveFrom: toLocalDateValue() } : {}),
    }
    if (!saveChinaHolidaySettings(next)) {
      setHolidaySettingsError('节假日设置暂时无法保存，请释放设备存储空间后重试。')
      return
    }
    setHolidaySettings(next)
    setHolidaySettingsError('')
  }, [holidaySettings])

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

  const saveRecord = useCallback((record: AttendanceRecord): boolean => {
    const next = upsertAttendanceRecord(records, record)
    if (!saveAttendanceRecords(next)) return false
    setRecords(next)
    closeSelectedDate()
    return true
  }, [closeSelectedDate, records])

  const resetRecord = useCallback((): boolean => {
    if (!selectedDate) return false
    const next = records.filter(record => record.date !== selectedDate)
    if (next.length === records.length) {
      closeSelectedDate()
      return true
    }
    if (!saveAttendanceRecords(next)) return false
    setRecords(next)
    closeSelectedDate()
    return true
  }, [closeSelectedDate, selectedDate, records])

  return <section className="page attendance-page">
    <header className="page-header"><div><p className="eyebrow">ATTENDANCE & SALARY</p><h1>薪苦日历</h1><p>上班、请假还是放假，每一天都按真实出勤算钱；正常出勤也可以按倍率或固定金额调整当天工资。</p></div></header>
    <section className="attendance-holiday-settings" aria-labelledby="china-holiday-settings-title"><span className="attendance-holiday-settings-icon"><Landmark size={18}/></span><div><strong id="china-holiday-settings-title">自动识别中国大陆节假日</strong><small>识别法定休假与调休补班，不自动设置加班倍率；手工出勤始终优先。</small>{holidaySettings.enabled && <em>从 {holidaySettings.effectiveFrom} 起生效，不重算更早的历史工资</em>}{holidaySettingsError && <em id="china-holiday-settings-error" className="attendance-save-error" role="alert">{holidaySettingsError}</em>}</div><button type="button" role="switch" aria-checked={holidaySettings.enabled} aria-label="自动识别中国大陆节假日" aria-describedby={holidaySettingsError ? 'china-holiday-settings-error' : undefined} className={holidaySettings.enabled ? 'active' : ''} onClick={toggleChinaHolidayCalendar}><i/></button></section>
    <AttendanceCalendar profile={profile} records={records} workRecords={workRecords} holidaySettings={holidaySettings} dimension={dimension} anchor={anchor} onChange={(nextDimension, nextAnchor) => { setDimension(nextDimension); setAnchor(nextAnchor) }} onSelectDate={selectDate}/>
    <div className="attendance-stats"><article><span><CalendarDays size={17}/></span><small>本月手工调整</small><strong>{monthStats.adjusted}<i>天</i></strong></article><article><span><CalendarClock size={17}/></span><small>本月请假 / 特殊出勤</small><strong>{monthStats.leave}<i>天</i></strong></article><article><span><Coffee size={17}/></span><small>本月放假</small><strong>{monthStats.holiday}<i>天</i></strong></article><article><span><CircleOff size={17}/></span><small>本月不计薪</small><strong>{monthStats.unpaid}<i>天</i></strong></article></div>
    <p className="attendance-help">自动判断优先级为：手工出勤 ＞ 中国大陆节假日与补班 ＞ 固定工作周或大小周。半天假按“半日正常工资＋半日请假工资”计算，请假固定金额只作用于请假半日。</p>
    <AttendanceDialog open={selectedDate !== null} date={selectedDate ?? toLocalDateValue()} record={selectedRecord} onSave={saveRecord} onReset={resetRecord} onCancel={closeSelectedDate}/>
  </section>
}
