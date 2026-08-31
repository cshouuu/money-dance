import { BadgeDollarSign, Ban, History, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { createId } from '../lib/id'
import { OVERTIME_MULTIPLIERS, type CompletedOvertimeInput } from '../lib/overtime'
import type { OvertimePayMode } from '../types'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'
import './OvertimeBackfillDialog.css'

interface OvertimeBackfillDialogProps {
  open: boolean
  onSave: (input: CompletedOvertimeInput) => string | null
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

export function OvertimeBackfillDialog({ open, onSave, onCancel }: OvertimeBackfillDialogProps) {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [payMode, setPayMode] = useState<OvertimePayMode>('multiplier')
  const [multiplier, setMultiplier] = useState(1.5)
  const [fixedAmount, setFixedAmount] = useState('')
  const [error, setError] = useState('')
  const requestIdRef = useRef('')
  const savingRef = useRef(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    const now = new Date()
    setStartTime(toLocalDateTimeInput(new Date(now.getTime() - 60 * 60 * 1000)))
    setEndTime(toLocalDateTimeInput(now))
    setPayMode('multiplier')
    setMultiplier(1.5)
    setFixedAmount('')
    setError('')
    savingRef.current = false
    requestIdRef.current = createId()
  }, [open])
  useDialogFocus(open, onCancel, dialogRef, closeButtonRef)

  if (!open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current || !event.currentTarget.reportValidity()) return
    const start = new Date(startTime)
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

    let payOption: Pick<CompletedOvertimeInput, 'payMode' | 'multiplier' | 'fixedAmount'>
    if (payMode === 'fixed') {
      const amount = parseNumberInput(fixedAmount)
      if (amount === null || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
        setError('请输入有效的固定加班费。')
        return
      }
      payOption = { payMode, fixedAmount: amount }
    } else if (payMode === 'multiplier') {
      payOption = { payMode, multiplier }
    } else {
      payOption = { payMode }
    }

    savingRef.current = true
    const saveError = onSave({
      ...payOption,
      id: requestIdRef.current,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    })
    if (saveError) {
      savingRef.current = false
      setError(saveError)
    }
  }

  const nowInput = toLocalDateTimeInput(new Date())
  return createPortal(<div className="dialog-backdrop overtime-backfill-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="overtime-backfill-dialog" role="dialog" aria-modal="true" aria-labelledby="overtime-backfill-title" onSubmit={submit}>
      <div className="overtime-dialog-header"><div><p className="eyebrow">OVERTIME BACKFILL</p><h2 id="overtime-backfill-title">补记一段已经结束的加班</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      <p className="overtime-dialog-copy">只补记真实发生的时间。支持跨天，收入仍统一记在开始加班的那一天。</p>

      <div className="overtime-backfill-times"><label><span>开始日期与时间</span><input required type="datetime-local" max={nowInput} value={startTime} onChange={event => { setStartTime(event.target.value); setError('') }}/></label><label><span>结束日期与时间</span><input required type="datetime-local" max={nowInput} value={endTime} onChange={event => { setEndTime(event.target.value); setError('') }}/></label></div>

      <fieldset className="overtime-backfill-pay"><legend>这段加班怎么算</legend><div className="overtime-backfill-pay-tabs"><button type="button" className={payMode === 'unpaid' ? 'active' : ''} aria-pressed={payMode === 'unpaid'} onClick={() => { setPayMode('unpaid'); setError('') }}><Ban size={14}/>无加班费</button><button type="button" className={payMode === 'multiplier' ? 'active' : ''} aria-pressed={payMode === 'multiplier'} onClick={() => { setPayMode('multiplier'); setError('') }}>工资倍率</button><button type="button" className={payMode === 'fixed' ? 'active' : ''} aria-pressed={payMode === 'fixed'} onClick={() => { setPayMode('fixed'); setError('') }}><BadgeDollarSign size={14}/>固定金额</button></div></fieldset>
      {payMode === 'multiplier' && <fieldset className="overtime-multiplier-field"><legend>选择工资倍率</legend><div className="overtime-multiplier-grid">{OVERTIME_MULTIPLIERS.map(value => <button key={value} type="button" className={multiplier === value ? 'active' : ''} aria-pressed={multiplier === value} onClick={() => setMultiplier(value)}>{value}倍</button>)}</div><p>补记金额按你当前设置的工资秒薪计算；历史工资不同可改用固定金额。</p></fieldset>}
      {payMode === 'fixed' && <label className="overtime-fixed-field"><span>整段固定加班费</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => { setFixedAmount(normalizeDecimalInput(event.target.value)); setError('') }} placeholder="0.00"/></div></label>}
      {error && <p className="overtime-dialog-error" role="alert">{error}</p>}
      <div className="overtime-dialog-actions"><button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm"><History size={16}/>保存补记</button></div>
    </form>
  </div>, document.body)
}
