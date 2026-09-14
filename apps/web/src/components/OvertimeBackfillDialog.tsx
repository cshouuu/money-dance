import { BadgeDollarSign, Ban, History, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { createId } from '../lib/id'
import type { CompletedOvertimeInput } from '../lib/overtime'
import { calculateOvertimeEarnings, originalOvertimeSecondRate } from '../lib/overtime'
import { calculateRates } from '@salary-flow/core'
import { loadProfile, salaryProfileForBusinessDate } from '../lib/profile'
import { toLocalDateValue } from '../lib/form'
import type { OvertimeSession, OvertimePayMode } from '../types'
import { Input, Tabs, TabsTrigger } from '../ui/BeuiControls'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'
import { OvertimeMultiplierInput } from './OvertimeMultiplierInput'
import './OvertimeBackfillDialog.css'

interface OvertimeBackfillDialogProps {
  open: boolean
  editing?: OvertimeSession | null
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

export function OvertimeBackfillDialog({ open, editing, onSave, onCancel }: OvertimeBackfillDialogProps) {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [payMode, setPayMode] = useState<OvertimePayMode>('multiplier')
  const [multiplier, setMultiplier] = useState('')
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
    setStartTime(toLocalDateTimeInput(editing ? new Date(editing.startTime) : new Date(now.getTime() - 60 * 60 * 1000)))
    setEndTime(toLocalDateTimeInput(editing ? new Date(editing.endTime) : now))
    setPayMode(editing?.payMode ?? 'multiplier')
    setMultiplier(editing?.multiplier === undefined ? '' : String(editing.multiplier))
    setFixedAmount(editing?.fixedAmount === undefined ? '' : String(editing.fixedAmount))
    setError('')
    savingRef.current = false
    requestIdRef.current = editing?.id ?? createId()
  }, [open, editing])
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
      const multiplierValue = parseNumberInput(multiplier)
      if (multiplierValue === null || multiplierValue <= 0) {
        setError('请输入有效的工资倍率。')
        return
      }
      payOption = { payMode, multiplier: multiplierValue }
    } else {
      payOption = { payMode }
    }

    savingRef.current = true
    const saveError = onSave({
      ...payOption,
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
  const previewStart = editing && startTime === toLocalDateTimeInput(new Date(editing.startTime)) ? editing.startTime : startTime
  const previewEnd = editing && endTime === toLocalDateTimeInput(new Date(editing.endTime)) ? editing.endTime : endTime
  const duration = (+new Date(previewEnd) - +new Date(previewStart)) / 1000
  const secondRate = startTime ? originalOvertimeSecondRate(editing, previewStart) ?? calculateRates(salaryProfileForBusinessDate(loadProfile(), toLocalDateValue(new Date(startTime)))).second : 0
  const previewAmount = duration > 0 ? calculateOvertimeEarnings({ payMode, multiplier: Number(multiplier), fixedAmount: Number(fixedAmount) }, duration, secondRate) : null
  return createPortal(<div className="dialog-backdrop overtime-backfill-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="overtime-backfill-dialog" role="dialog" aria-modal="true" aria-labelledby="overtime-backfill-title" onSubmit={submit}>
      <div className="overtime-dialog-header"><div><p className="eyebrow">OVERTIME BACKFILL</p><h2 id="overtime-backfill-title">{editing ? '修改这段加班记录' : '补记一段已经结束的加班'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      <p className="overtime-dialog-copy">只补记真实发生的时间。支持跨天，收入记在开始加班的那一天；修改后同步更新关联账目，已点亮成就保留。</p>

      <div className="overtime-backfill-times"><Input label="开始日期与时间" required type="datetime-local" max={nowInput} value={startTime} onValueChange={value => { setStartTime(value); setError('') }}/><Input label="结束日期与时间" required type="datetime-local" max={nowInput} value={endTime} onValueChange={value => { setEndTime(value); setError('') }}/></div>

      <fieldset className="overtime-backfill-pay"><legend>这段加班怎么算</legend><Tabs className="overtime-backfill-pay-tabs" value={payMode} onValueChange={value => { setPayMode(value as OvertimePayMode); setError('') }}><TabsTrigger value="unpaid"><Ban size={14}/>无加班费</TabsTrigger><TabsTrigger value="multiplier">工资倍率</TabsTrigger><TabsTrigger value="fixed"><BadgeDollarSign size={14}/>本次固定金额</TabsTrigger></Tabs></fieldset>
      {payMode === 'multiplier' && <OvertimeMultiplierInput value={multiplier} onValueChange={value => { setMultiplier(value); setError('') }} hint="补记按开始日期的工资折算；修改原记录时，开始日期不变则沿用原单价。"/>}
      {payMode === 'fixed' && <Input rootClassName="overtime-fixed-field" label="整段固定加班费" required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => { setFixedAmount(normalizeDecimalInput(value)); setError('') }} placeholder="0.00"/>}
      {previewAmount !== null && <p className="overtime-dialog-copy">本次加班费：¥{previewAmount.toFixed(2)}{editing ? `（原 ¥${editing.earnedAmount.toFixed(2)}）` : ''}</p>}
      {error && <p className="overtime-dialog-error" role="alert">{error}</p>}
      <div className="overtime-dialog-actions"><button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm"><History size={16}/>{editing ? '保存修改' : '保存补记'}</button></div>
    </form>
  </div>, document.body)
}
