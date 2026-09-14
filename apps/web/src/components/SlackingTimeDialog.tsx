import { Clock3, History, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createId } from '../lib/id'
import type { SlackingSession } from '../types'
import { calculatePaidTimeEarnings } from '../lib/paidTime'
import { loadProfile } from '../lib/profile'
import { formatDuration } from '@salary-flow/core'
import type { CompletedSlackingInput } from '../lib/slacking'
import { Input } from '../ui/BeuiControls'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'
import './SlackingTimeDialog.css'

interface SlackingTimeDialogProps {
  open: boolean
  editing?: SlackingSession | null
  purpose: 'start' | 'backfill'
  onStart: (startTime: string) => string | null
  onBackfill: (input: CompletedSlackingInput) => string | null
  onCancel: () => void
}

function toLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function SlackingTimeDialog({ open, purpose, editing, onStart, onBackfill, onCancel }: SlackingTimeDialogProps) {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const requestIdRef = useRef('')
  const savingRef = useRef(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    const now = new Date()
    setStartTime(toLocalDateTimeInput(editing ? new Date(editing.startTime) : new Date(now.getTime() - (purpose === 'backfill' ? 30 * 60 * 1000 : 0))))
    setEndTime(toLocalDateTimeInput(editing ? new Date(editing.endTime) : now))
    setError('')
    savingRef.current = false
    requestIdRef.current = editing?.id ?? createId()
  }, [open, purpose, editing])
  useDialogFocus(open, onCancel, dialogRef, closeButtonRef)

  if (!open) return null

  const saveStart = (startAt: Date) => {
    const now = new Date()
    if (Number.isNaN(startAt.getTime())) {
      setError('请选择有效的实际开始时间。')
      return
    }
    if (startAt > now) {
      setError('实际开始时间不能晚于现在。')
      return
    }
    const saveError = onStart(startAt.toISOString())
    if (saveError) setError(saveError)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current || !event.currentTarget.reportValidity()) return
    const start = new Date(startTime)
    if (purpose === 'start') {
      saveStart(start)
      return
    }
    const end = new Date(endTime)
    const now = new Date()
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('请选择有效的开始和结束时间。')
      return
    }
    if (end <= start) {
      setError('结束时间必须晚于开始时间。')
      return
    }
    if (end > now) {
      setError('补记的结束时间不能晚于现在。')
      return
    }
    savingRef.current = true
    const saveError = onBackfill({
      id: requestIdRef.current,
      ...(editing && startTime === toLocalDateTimeInput(new Date(editing.startTime)) ? { startLocalDate: editing.startLocalDate, startTimezoneOffsetMinutes: editing.startTimezoneOffsetMinutes } : {}),
      startTime: editing && startTime === toLocalDateTimeInput(new Date(editing.startTime)) ? editing.startTime : start.toISOString(),
      endTime: editing && endTime === toLocalDateTimeInput(new Date(editing.endTime)) ? editing.endTime : end.toISOString(),
    })
    if (saveError) {
      savingRef.current = false
      setError(saveError)
    }
  }

  const nowInput = toLocalDateTimeInput(new Date())
  const preview = purpose === 'backfill' && startTime && endTime && new Date(endTime) > new Date(startTime)
    ? calculatePaidTimeEarnings(loadProfile(), editing && startTime === toLocalDateTimeInput(new Date(editing.startTime)) ? editing.startTime : startTime,
      editing && endTime === toLocalDateTimeInput(new Date(editing.endTime)) ? editing.endTime : endTime) : null
  return createPortal(<div className="dialog-backdrop slacking-time-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="slacking-time-dialog" role="dialog" aria-modal="true" aria-labelledby="slacking-time-title" onSubmit={submit}>
      <div className="slacking-time-header"><div><p className="eyebrow">SLACKING TIME</p><h2 id="slacking-time-title">{editing ? '修改这段摸鱼记录' : purpose === 'start' ? '从什么时候开始摸鱼？' : '补记一段已经结束的摸鱼'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      <p className="slacking-time-copy">{purpose === 'start' ? '想起来晚了没关系，可以把实际开始时间往前补。' : '填写实际时间，收益按对应日期的工资与出勤规则计算。修改后保留原记录，已点亮的成就保留。'}</p>
      {purpose === 'start' && <button type="button" className="slacking-now-button" onClick={() => saveStart(new Date())}><Clock3 size={16}/><span><b>从现在开始</b><small>立即开始计时</small></span></button>}
      {purpose === 'start' && <div className="slacking-time-divider"><span>或补记实际开始时间</span></div>}
      <div className={`slacking-time-fields ${purpose}`}><Input label="开始日期与时间" required type="datetime-local" max={nowInput} value={startTime} onValueChange={value => { setStartTime(value); setError('') }}/>{purpose === 'backfill' && <Input label="结束日期与时间" required type="datetime-local" max={nowInput} value={endTime} onValueChange={value => { setEndTime(value); setError('') }}/>}</div>
      {preview && <p className="slacking-time-copy">{editing ? '修改后' : '预计'}：计薪 {formatDuration(preview.paidSeconds)} · ¥{preview.earnedAmount.toFixed(2)}{editing ? `（原 ¥${editing.earnedAmount.toFixed(2)}）` : ''}</p>}
      {error && <p className="slacking-time-error" role="alert">{error}</p>}
      <div className="slacking-time-actions"><button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm"><History size={15}/>{purpose === 'start' ? '按这个时间开始' : editing ? '保存修改' : '保存补记'}</button></div>
    </form>
  </div>, document.body)
}
