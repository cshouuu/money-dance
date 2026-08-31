import { ArrowLeft, BadgeDollarSign, Ban, Clock3, History, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { OVERTIME_MULTIPLIERS } from '../lib/overtime'
import type { ActiveOvertime, OvertimeStartOption } from '../types'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'
import './OvertimeStartDialog.css'

interface OvertimeStartDialogProps {
  open: boolean
  onStart: (option: ActiveOvertime) => string | null
  onCancel: () => void
}

type Step = 'pay-confirm' | 'pay-details'
type PaidMode = 'multiplier' | 'fixed'
type StartMode = 'now' | 'custom'

function toLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function OvertimeStartDialog({ open, onStart, onCancel }: OvertimeStartDialogProps) {
  const [step, setStep] = useState<Step>('pay-confirm')
  const [paidMode, setPaidMode] = useState<PaidMode>('multiplier')
  const [multiplier, setMultiplier] = useState<number>(1.5)
  const [fixedAmount, setFixedAmount] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [customStartTime, setCustomStartTime] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const paidChoiceRef = useRef<HTMLButtonElement>(null)
  const paidModeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    setStep('pay-confirm')
    setPaidMode('multiplier')
    setMultiplier(1.5)
    setFixedAmount('')
    setStartMode('now')
    setCustomStartTime(toLocalDateTimeInput(new Date()))
    setError('')
  }, [open])
  useDialogFocus(open, onCancel, dialogRef, closeButtonRef)

  if (!open) return null

  const showPayConfirm = () => {
    setStep('pay-confirm')
    window.setTimeout(() => paidChoiceRef.current?.focus(), 0)
  }
  const showPayDetails = () => {
    setStep('pay-details')
    window.setTimeout(() => paidModeButtonRef.current?.focus(), 0)
  }

  const submitOption = (option: OvertimeStartOption): boolean => {
    const now = new Date()
    const startAt = startMode === 'now' ? now : new Date(customStartTime)
    if (Number.isNaN(startAt.getTime())) {
      setError('请选择有效的实际开始时间。')
      showPayConfirm()
      return false
    }
    if (startAt.getTime() > now.getTime()) {
      setError('实际开始时间不能晚于现在。')
      showPayConfirm()
      return false
    }
    const saveError = onStart({ ...option, startTime: startAt.toISOString() })
    if (saveError) {
      setError(saveError)
      showPayConfirm()
      return false
    }
    return true
  }

  const startPaid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paidMode === 'multiplier') {
      submitOption({ payMode: 'multiplier', multiplier })
      return
    }
    const amount = parseNumberInput(fixedAmount)
    if (!event.currentTarget.reportValidity() || amount === null || amount <= 0 || amount > MAX_MONEY_AMOUNT) return
    submitOption({ payMode: 'fixed', fixedAmount: amount })
  }

  const title = step === 'pay-confirm' ? '居然要加班了，给加班费的吗' : '还好给钱，给多少？'

  return createPortal(<div className="dialog-backdrop overtime-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="overtime-start-dialog" role="dialog" aria-modal="true" aria-labelledby="overtime-dialog-title" onSubmit={startPaid}>
      <div className="overtime-dialog-header">
        <div><p className="eyebrow">OVERTIME CHECK</p><h2 id="overtime-dialog-title">{title}</h2></div>
        <button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button>
      </div>

      {step === 'pay-confirm' ? <>
        <p className="overtime-dialog-copy">先确认从什么时候开始、这次加班怎么算。想起来晚了也可以补上已经过去的时间。</p>
        <fieldset className="overtime-start-time-field"><legend>实际开始时间</legend><div className="overtime-time-tabs"><button type="button" className={startMode === 'now' ? 'active' : ''} aria-pressed={startMode === 'now'} onClick={() => { setStartMode('now'); setError('') }}><Clock3 size={15}/>从现在开始</button><button type="button" className={startMode === 'custom' ? 'active' : ''} aria-pressed={startMode === 'custom'} onClick={() => { setStartMode('custom'); setError('') }}><History size={15}/>补记实际开始</button></div>{startMode === 'custom' && <label><span>开始日期与时间</span><input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={customStartTime} onChange={event => { setCustomStartTime(event.target.value); setError('') }}/></label>}</fieldset>
        <div className="overtime-pay-question">
          <button type="button" className="overtime-unpaid-choice" onClick={() => submitOption({ payMode: 'unpaid' })}><Ban size={18}/><span><b>不给，很烦</b><small>只记录加班时间</small></span></button>
          <button ref={paidChoiceRef} type="button" className="overtime-paid-choice" onClick={showPayDetails}><BadgeDollarSign size={19}/><span><b>给钱</b><small>设置倍率或固定金额</small></span></button>
        </div>
      </> : <>
        <fieldset className="overtime-pay-field"><legend>加班费类型</legend><div className="overtime-pay-tabs"><button ref={paidModeButtonRef} type="button" className={paidMode === 'multiplier' ? 'active' : ''} aria-pressed={paidMode === 'multiplier'} onClick={() => setPaidMode('multiplier')}>按工资倍率</button><button type="button" className={paidMode === 'fixed' ? 'active' : ''} aria-pressed={paidMode === 'fixed'} onClick={() => setPaidMode('fixed')}>固定加班费</button></div></fieldset>
        {paidMode === 'multiplier' ? <fieldset className="overtime-multiplier-field"><legend>选择工资倍率</legend><div className="overtime-multiplier-grid">{OVERTIME_MULTIPLIERS.map(value => <button key={value} type="button" className={multiplier === value ? 'active' : ''} aria-pressed={multiplier === value} onClick={() => setMultiplier(value)}>{value}倍</button>)}</div><p>按你的正常秒薪 × {multiplier} 倍实时计算。</p></fieldset> : <label className="overtime-fixed-field"><span>本次固定加班费</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => setFixedAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div><small>固定金额按本次加班总额计算。</small></label>}
        <div className="overtime-dialog-actions"><button type="button" className="dialog-cancel" onClick={showPayConfirm}><ArrowLeft size={15}/>返回</button><button type="submit" className="dialog-confirm"><BadgeDollarSign size={16}/>开始加班</button></div>
      </>}
      {error && <p className="overtime-dialog-error" role="alert">{error}</p>}
    </form>
  </div>, document.body)
}
