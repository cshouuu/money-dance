import { Clock3, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { localDateWithTime, toLocalDateValue, toLocalTimeValue } from '../lib/form'
import { isFlexibleStartTimeAllowed, resolveFlexiblePlannedEndTime } from '../lib/work'
import type { DailyWorkRecord } from '../types'
import { Input } from '../ui/BeuiControls'
import './WorkTimeDialog.css'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'

interface WorkTimeDialogProps {
  open: boolean
  purpose: 'start' | 'adjust'
  date: string
  plannedStart: string
  record?: DailyWorkRecord
  storageError?: string
  onStart: (time: string, plannedEndTime?: string) => void
  onAdjust: (startTime: string, endTime?: string, endDate?: string) => void
  onCancel: () => void
}

function nextDateValue(date: string): string {
  const next = localDateWithTime(date, '12:00')
  next.setDate(next.getDate() + 1)
  return toLocalDateValue(next)
}

function recordTime(record: DailyWorkRecord | undefined, field: 'start' | 'end'): string {
  const session = field === 'start' ? record?.sessions[0] : record?.sessions.at(-1)
  const value = field === 'start' ? session?.startTime : session?.endTime
  return value ? toLocalTimeValue(new Date(value)) : ''
}

export function WorkTimeDialog({ open, purpose, date, plannedStart, record, storageError, onStart, onAdjust, onCancel }: WorkTimeDialogProps) {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [endDate, setEndDate] = useState(date)
  const [plannedEndDate, setPlannedEndDate] = useState(date)
  const [plannedEndTime, setPlannedEndTime] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const nowTime = toLocalTimeValue()
  const canUsePlannedStart = isFlexibleStartTimeAllowed(date, plannedStart)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    setStartTime(recordTime(record, 'start') || toLocalTimeValue())
    setEndTime(recordTime(record, 'end'))
    const recordEndTime = record?.sessions.at(-1)?.endTime
    setEndDate(recordEndTime ? toLocalDateValue(new Date(recordEndTime)) : date)
    setPlannedEndDate(date)
    setPlannedEndTime('')
    setError('')
  }, [date, open, purpose, record])
  useDialogFocus(open, onCancel, dialogRef, closeButtonRef)

  if (!open) return null

  const startWithTime = (time: string) => {
    if (!isFlexibleStartTimeAllowed(date, time)) {
      setError('开始时间不能晚于当前时间。')
      return
    }
    const plannedEnd = resolveFlexiblePlannedEndTime(date, time, plannedEndDate, plannedEndTime)
    if (plannedEnd === null) {
      setError('预计结束时间必须晚于开始时间，并且是未来时间。')
      return
    }
    setError('')
    onStart(time, plannedEnd)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    if (endTime && localDateWithTime(endDate, endTime) <= localDateWithTime(date, startTime)) {
      setError('结束时间需要晚于开始时间。')
      return
    }
    if (purpose === 'start') {
      startWithTime(startTime)
    } else onAdjust(startTime, endTime || undefined, endTime ? endDate : undefined)
  }

  return createPortal(<div className="work-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="work-time-dialog" role="dialog" aria-modal="true" aria-labelledby="work-time-dialog-title" onSubmit={submit}>
      <div className="work-dialog-header"><div><p className="eyebrow">TODAY ONLY</p><h2 id="work-time-dialog-title">{purpose === 'start' ? '今天几点开工？' : '修正今天的工作时间'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      {purpose === 'start' && <><p className="work-dialog-copy">只调整今天，明天仍会使用你的默认计薪方式。</p><div className="work-quick-actions"><button type="button" className="work-now-button" onClick={()=>startWithTime(nowTime)}><Clock3 size={16}/><span><b>从现在开始</b><small>{nowTime}</small></span></button><button type="button" disabled={!canUsePlannedStart} onClick={()=>startWithTime(plannedStart)}><span><b>按计划时间</b><small>{plannedStart}{canUsePlannedStart ? '' : ' · 尚未到点'}</small></span></button></div><div className="work-dialog-divider"><span>或补记实际开始时间</span></div></>}
      <div className="work-time-fields"><Input label="开始时间" required type="time" max={date === toLocalDateValue() ? nowTime : undefined} value={startTime} onValueChange={value=>{setStartTime(value);setError('')}}/>{purpose === 'adjust' && <><Input label="结束日期" type="date" min={date} max={toLocalDateValue()} disabled={!endTime} value={endDate} onValueChange={value=>{setEndDate(value);setError('')}}/><Input label="结束时间" hint="留空则继续计薪" type="time" max={endDate === toLocalDateValue() ? nowTime : undefined} value={endTime} onValueChange={value=>{setEndTime(value);if(!value)setEndDate(date);setError('')}}/></>}
      </div>
      {purpose === 'start' && <div className="work-planned-end"><div className="work-dialog-divider"><span>可选：到点自动停止计薪</span></div><div className="work-planned-end-fields"><Input label="预计结束日期" type="date" min={date} max={nextDateValue(date)} disabled={!plannedEndTime} value={plannedEndDate} onValueChange={value=>{setPlannedEndDate(value);setError('')}}/><Input label="预计结束时间" hint="留空则手动结束" type="time" value={plannedEndTime} onValueChange={value=>{setPlannedEndTime(value);if(!value)setPlannedEndDate(date);setError('')}}/></div><small className="work-planned-end-note">跨午夜时请选择次日日期。到点后会冻结工时，下次打开应用继续选择结算方式。</small></div>}
      {(error || storageError) && <p className="work-dialog-error" role="alert">{error || storageError}</p>}
      <div className="work-dialog-actions"><button type="button" className="work-cancel-button" onClick={onCancel}>取消</button><button type="submit" className="work-confirm-button">{purpose === 'start' ? '按这个时间开始' : '保存时间'}</button></div>
    </form>
  </div>, document.body)
}
