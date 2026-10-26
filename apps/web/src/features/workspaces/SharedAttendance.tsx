import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isEmployedOn } from '@salary-flow/core'
import { AttendanceDialog } from '../../components/AttendanceDialog'
import { Button, SelectField } from '../../ui/BeuiControls'
import { attendanceStatusLabel, resolveAttendanceDay, saveAttendanceRecords, upsertAttendanceRecord } from '../../lib/attendance'
import { toLocalDateValue, toLocalMonthValue } from '../../lib/form'
import { PRIMARY_SPACE_ID, type WorkSpace } from '../../lib/workspaces/model'
import { commitWorkspaces, loadWorkspaceStore, replaceSpace } from '../../lib/workspaces/store'
import type { AttendanceRecord } from '../../types'
import { rosterDayLabel } from '../../lib/roster'
import './Workspaces.css'

export function SharedAttendance({ spaces }: { spaces: WorkSpace[] }) {
  const [month, setMonth] = useState(toLocalMonthValue)
  const [filter, setFilter] = useState('all')
  const [date, setDate] = useState(toLocalDateValue)
  const [editing, setEditing] = useState<WorkSpace | null>(null)
  const [expected, setExpected] = useState(loadWorkspaceStore)
  const [error, setError] = useState('')
  const visible = spaces.filter(space => filter === 'all' || space.id === filter)
  const [year, m] = month.split('-').map(Number)
  const days = Array.from({ length: new Date(year, m, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  const move = (offset: number) => setMonth(toLocalMonthValue(new Date(year, m - 1 + offset, 1)))
  const label = (space: WorkSpace, day: string) => {
    if (!isEmployedOn(space.profile, day)) return '未任职'
    const record = space.attendanceRecords.find(item => item.date === day)
    return record ? attendanceStatusLabel(record) : rosterDayLabel(space.profile, day, space.holidaySettings)
      ?? (space.workRecords.some(item => item.date === day) ? '已记录工作' : space.profile.defaultWorkMode === 'flexible' ? '按实际记录' : resolveAttendanceDay(new Date(`${day}T12:00:00`), space.profile, undefined, space.holidaySettings).isWorkday ? '上班' : '休息')
  }
  const save = async (record?: AttendanceRecord) => {
    if (!editing) return false
    try {
      const records = record ? upsertAttendanceRecord(editing.attendanceRecords, record) : editing.attendanceRecords.filter(item => item.date !== date)
      if (editing.id === PRIMARY_SPACE_ID) {
        const current = spaces.find(space => space.id === PRIMARY_SPACE_ID)!
        if (JSON.stringify(current.attendanceRecords) !== JSON.stringify(editing.attendanceRecords)) throw new Error('出勤记录已更新，请重新打开。')
        if (!saveAttendanceRecords(records)) throw new Error('无法保存出勤记录，请重试。')
      } else await commitWorkspaces(expected, store => replaceSpace(store, { ...editing, attendanceRecords: records }))
      setEditing(null); setError(''); return true
    } catch (reason) { setError((reason as Error).message); return false }
  }
  return <section className="page workspace-page"><header className="page-header"><div><p className="eyebrow">SHARED CALENDAR</p><h1>薪苦日历</h1><p>同一天可以有多份工作；每条出勤只调整所属空间。</p></div></header><SelectField label="日历范围" value={filter} onValueChange={setFilter}><option value="all">全部空间</option>{spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</SelectField><div className="workspace-actions"><Button variant="secondary" aria-label="上个月" onClick={() => move(-1)}>←</Button><b>{month}</b><Button variant="secondary" aria-label="下个月" onClick={() => move(1)}>→</Button><Button variant="ghost" onClick={() => { setMonth(toLocalMonthValue()); setDate(toLocalDateValue()) }}>今天</Button><Link to="/attendance?space=primary">主业假期与详细统计</Link></div>
    <div className="workspace-calendar-grid">{'日一二三四五六'.split('').map(day => <small key={day}>{day}</small>)}{Array.from({ length: new Date(year, m - 1, 1).getDay() }, (_, i) => <span key={`blank-${i}`}/>)}{days.map(day => <Button key={day} className="workspace-calendar-day" variant={date === day ? 'primary' : 'secondary'} onClick={() => setDate(day)}><b>{Number(day.slice(-2))}</b><small className="workspace-calendar-count">{visible.filter(space => isEmployedOn(space.profile, day)).length} 份工作</small>{visible.map(space => <small className="workspace-calendar-label" key={space.id}>{space.name} · {label(space, day)}</small>)}</Button>)}</div>
    <article className="workspace-panel"><h2>{date}</h2>{visible.map(space => <div className="workspace-journey-row" key={space.id}><div><b>{space.name}</b><p>{label(space, date)}</p></div><Button variant="secondary" onClick={() => { setExpected(loadWorkspaceStore()); setEditing(space); setError('') }}>调整这份工作的出勤</Button></div>)}{error && <p role="alert">{error}</p>}</article>
    {editing && <AttendanceDialog open date={date} record={editing.attendanceRecords.find(item => item.date === date)} space={editing} onSave={save} onReset={() => save()} onCancel={() => setEditing(null)}/>}
  </section>
}
