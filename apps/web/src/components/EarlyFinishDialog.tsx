import { ArrowLeft, BadgeDollarSign, Ban, CalendarCheck2, Clock3, WalletCards, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDuration } from '@salary-flow/core'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { OVERTIME_MULTIPLIERS } from '../lib/overtime'
import type { OvertimeStartOption } from '../types'
import './ConfirmDialog.css'
import './EarlyFinishDialog.css'
import { useModalViewport } from './useModalViewport'

interface EarlyFinishDialogProps {
  open: boolean
  settlementKind: 'under-target' | 'over-target'
  workedSeconds: number
  targetSeconds: number
  actualAmount: number
  fullDayAmount: number
  secondRate: number
  error?: string
  onActual: () => void
  onFullDay: () => void
  onAttendance: () => void
  onOvertime: (option: OvertimeStartOption) => void
  onCancel: () => void
}

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function EarlyFinishDialog({ open, settlementKind, workedSeconds, targetSeconds, actualAmount, fullDayAmount, secondRate, error, onActual, onFullDay, onAttendance, onOvertime, onCancel }: EarlyFinishDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const paidChoiceRef = useRef<HTMLButtonElement>(null)
  const paidModeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(true)
  const [showPaidOptions, setShowPaidOptions] = useState(false)
  const [paidMode, setPaidMode] = useState<'multiplier' | 'fixed'>('multiplier')
  const [multiplier, setMultiplier] = useState<number>(1.5)
  const [fixedAmount, setFixedAmount] = useState('')
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = true
    setShowPaidOptions(false)
    setPaidMode('multiplier')
    setMultiplier(1.5)
    setFixedAmount('')
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1) ?? first
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      if (restoreFocusRef.current) previousFocus?.focus()
    }
  }, [open, settlementKind, onCancel])

  useEffect(() => {
    if (open && error) restoreFocusRef.current = true
  }, [error, open])

  if (!open) return null

  const showPaidSettlement = () => {
    setShowPaidOptions(true)
    window.setTimeout(() => paidModeButtonRef.current?.focus(), 0)
  }
  const showSettlementChoices = () => {
    setShowPaidOptions(false)
    window.setTimeout(() => paidChoiceRef.current?.focus(), 0)
  }

  const excessSeconds = Math.max(0, workedSeconds - targetSeconds)
  const submitPaidOvertime = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paidMode === 'multiplier') {
      restoreFocusRef.current = false
      onOvertime({ payMode: 'multiplier', multiplier })
      return
    }
    const amount = parseNumberInput(fixedAmount)
    if (!event.currentTarget.reportValidity() || amount === null || amount <= 0 || amount > MAX_MONEY_AMOUNT) return
    restoreFocusRef.current = false
    onOvertime({ payMode: 'fixed', fixedAmount: amount })
  }

  return createPortal(<div className="dialog-backdrop early-finish-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <div ref={dialogRef} className="confirm-dialog early-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="early-finish-title" aria-describedby="early-finish-description">
      <div className="early-finish-header"><div><p className="eyebrow">WORK SETTLEMENT</p><h2 id="early-finish-title">{settlementKind === 'over-target' ? '今天超出目标工时' : '今天还没到目标工时'}</h2></div><button ref={closeButtonRef} type="button" aria-label="暂时关闭结算" onClick={onCancel}><X size={18}/></button></div>
      {settlementKind === 'under-target' ? <>
        <p id="early-finish-description">今天实际工作 {formatDuration(workedSeconds)}，目标 {formatDuration(targetSeconds)}。这次如何记入账本？</p>
        <div className="early-finish-options">
          <button type="button" onClick={() => { restoreFocusRef.current = false; onActual() }}><Clock3 size={19}/><span><b>按实际时长计薪</b><small>按已工作的 {formatDuration(workedSeconds)} 记入 {money(actualAmount)}</small></span></button>
          <button type="button" onClick={() => { restoreFocusRef.current = false; onFullDay() }}><WalletCards size={19}/><span><b>按正常出勤计全天工资</b><small>按目标工时结算 {money(fullDayAmount)}</small></span></button>
          <button type="button" className="attendance-option" onClick={() => { restoreFocusRef.current = false; onAttendance() }}><CalendarCheck2 size={19}/><span><b>调整今天的出勤情况</b><small>设置请假、特殊出勤或固定金额</small></span></button>
        </div>
      </> : <>
        <p id="early-finish-description">正常工时 {formatDuration(targetSeconds)} 已按 {money(fullDayAmount)} 结算，超出的 {formatDuration(excessSeconds)} 要怎么算？</p>
        {!showPaidOptions ? <div className="early-finish-options overtime-settlement-options">
          <button type="button" onClick={() => { restoreFocusRef.current = false; onOvertime({ payMode: 'unpaid' }) }}><Ban size={19}/><span><b>超出部分不计薪</b><small>仍记录 {formatDuration(excessSeconds)} 加班时长并累计成就</small></span></button>
          <button ref={paidChoiceRef} type="button" className="paid-overtime-option" onClick={showPaidSettlement}><BadgeDollarSign size={19}/><span><b>超出部分按加班计薪</b><small>选择工资倍率或设置固定金额</small></span></button>
        </div> : <form className="early-finish-pay-form" onSubmit={submitPaidOvertime}>
          <fieldset><legend>加班费类型</legend><div className="early-finish-pay-tabs"><button ref={paidModeButtonRef} type="button" className={paidMode === 'multiplier' ? 'active' : ''} aria-pressed={paidMode === 'multiplier'} onClick={() => setPaidMode('multiplier')}>按工资倍率</button><button type="button" className={paidMode === 'fixed' ? 'active' : ''} aria-pressed={paidMode === 'fixed'} onClick={() => setPaidMode('fixed')}>固定金额</button></div></fieldset>
          {paidMode === 'multiplier' ? <fieldset><legend>工资倍率</legend><div className="early-finish-multiplier-grid">{OVERTIME_MULTIPLIERS.map(value => <button key={value} type="button" className={multiplier === value ? 'active' : ''} aria-pressed={multiplier === value} onClick={() => setMultiplier(value)}>{value}倍</button>)}</div><small>预计加班收入 {money(excessSeconds * secondRate * multiplier)}</small></fieldset> : <label className="early-finish-fixed-field"><span>本次固定加班费</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => setFixedAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div><small>固定金额按全部超出工时结算。</small></label>}
          <div className="early-finish-pay-actions"><button type="button" onClick={showSettlementChoices}><ArrowLeft size={15}/>返回</button><button type="submit"><BadgeDollarSign size={16}/>确认结算</button></div>
        </form>}
      </>}
      {error && <p className="early-finish-error" role="alert">{error}</p>}
      <p className="early-finish-note">点击结束时已经停止计时；关闭后可从首页继续完成结算。</p>
    </div>
  </div>, document.body)
}
