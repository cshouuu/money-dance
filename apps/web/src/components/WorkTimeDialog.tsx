import { Clock3, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { localDateWithTime, toLocalTimeValue } from '../lib/form'
import type { DailyWorkRecord } from '../types'
import './WorkTimeDialog.css'

interface WorkTimeDialogProps {
  open: boolean
  purpose: 'start' | 'adjust'
  date: string
  plannedStart: string
  record?: DailyWorkRecord
  onStart: (time: string) => void
  onAdjust: (startTime: string, endTime?: string) => void
  onCancel: () => void
}

function recordTime(record: DailyWorkRecord | undefined, field: 'start' | 'end'): string {
  const session = field === 'start' ? record?.sessions[0] : record?.sessions.at(-1)
  const value = field === 'start' ? session?.startTime : session?.endTime
  return value ? toLocalTimeValue(new Date(value)) : ''
}

export function WorkTimeDialog({ open, purpose, date, plannedStart, record, onStart, onAdjust, onCancel }: WorkTimeDialogProps) {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const nowTime = toLocalTimeValue()

  useEffect(() => {
    if (!open) return
    setStartTime(recordTime(record, 'start') || nowTime)
    setEndTime(recordTime(record, 'end'))
    setError('')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, purpose, record, nowTime, onCancel])

  if (!open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    if (endTime && localDateWithTime(date, endTime) <= localDateWithTime(date, startTime)) {
      setError('结束时间需要晚于开始时间。')
      return
    }
    if (purpose === 'start') onStart(startTime)
    else onAdjust(startTime, endTime || undefined)
  }

  return createPortal(<div className="work-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form className="work-time-dialog" role="dialog" aria-modal="true" aria-labelledby="work-time-dialog-title" onSubmit={submit}>
      <div className="work-dialog-header"><div><p className="eyebrow">TODAY ONLY</p><h2 id="work-time-dialog-title">{purpose === 'start' ? '今天几点开工？' : '修正今天的工作时间'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      {purpose === 'start' && <><p className="work-dialog-copy">只调整今天，明天仍会使用你的默认计薪方式。</p><div className="work-quick-actions"><button type="button" className="work-now-button" onClick={()=>onStart(nowTime)}><Clock3 size={16}/><span><b>从现在开始</b><small>{nowTime}</small></span></button><button type="button" onClick={()=>onStart(plannedStart)}><span><b>按计划时间</b><small>{plannedStart}</small></span></button></div><div className="work-dialog-divider"><span>或补记实际开始时间</span></div></>}
      <div className="work-time-fields"><label><span>开始时间</span><input required type="time" max={nowTime} value={startTime} onChange={event=>{setStartTime(event.target.value);setError('')}}/></label>{purpose === 'adjust' && <label><span>结束时间 <small>留空则继续计薪</small></span><input type="time" max={nowTime} value={endTime} onChange={event=>{setEndTime(event.target.value);setError('')}}/></label>}</div>
      {error && <p className="work-dialog-error" role="alert">{error}</p>}
      <div className="work-dialog-actions"><button type="button" className="work-cancel-button" onClick={onCancel}>取消</button><button type="submit" className="work-confirm-button">{purpose === 'start' ? '按这个时间开始' : '保存时间'}</button></div>
    </form>
  </div>, document.body)
}
