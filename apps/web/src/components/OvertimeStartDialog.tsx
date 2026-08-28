import { ArrowLeft, BadgeDollarSign, Ban, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { OVERTIME_MULTIPLIERS } from '../lib/overtime'
import type { OvertimeStartOption } from '../types'
import { useModalViewport } from './useModalViewport'
import './OvertimeStartDialog.css'

interface OvertimeStartDialogProps {
  open: boolean
  onStart: (option: OvertimeStartOption) => void
  onCancel: () => void
}

type Step = 'pay-confirm' | 'pay-details'
type PaidMode = 'multiplier' | 'fixed'

export function OvertimeStartDialog({ open, onStart, onCancel }: OvertimeStartDialogProps) {
  const [step, setStep] = useState<Step>('pay-confirm')
  const [paidMode, setPaidMode] = useState<PaidMode>('multiplier')
  const [multiplier, setMultiplier] = useState<number>(1.5)
  const [fixedAmount, setFixedAmount] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    setStep('pay-confirm')
    setPaidMode('multiplier')
    setMultiplier(1.5)
    setFixedAmount('')
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onCancel])

  if (!open) return null

  const startPaid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paidMode === 'multiplier') {
      onStart({ payMode: 'multiplier', multiplier })
      return
    }
    const amount = parseNumberInput(fixedAmount)
    if (!event.currentTarget.reportValidity() || amount === null || amount <= 0 || amount > MAX_MONEY_AMOUNT) return
    onStart({ payMode: 'fixed', fixedAmount: amount })
  }

  const title = step === 'pay-confirm' ? '居然要加班了，给加班费的吗' : '还好给钱，给多少？'

  return createPortal(<div className="dialog-backdrop overtime-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form className="overtime-start-dialog" role="dialog" aria-modal="true" aria-labelledby="overtime-dialog-title" onSubmit={startPaid}>
      <div className="overtime-dialog-header">
        <div><p className="eyebrow">OVERTIME CHECK</p><h2 id="overtime-dialog-title">{title}</h2></div>
        <button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button>
      </div>

      {step === 'pay-confirm' ? <>
        <p className="overtime-dialog-copy">先确认这次加班怎么算，计时会在选择后立即开始。</p>
        <div className="overtime-pay-question">
          <button type="button" className="overtime-unpaid-choice" onClick={() => onStart({ payMode: 'unpaid' })}><Ban size={18}/><span><b>不给，很烦</b><small>只记录加班时间</small></span></button>
          <button type="button" className="overtime-paid-choice" onClick={() => setStep('pay-details')}><BadgeDollarSign size={19}/><span><b>给钱</b><small>设置倍率或固定金额</small></span></button>
        </div>
      </> : <>
        <fieldset className="overtime-pay-field"><legend>加班费类型</legend><div className="overtime-pay-tabs"><button type="button" className={paidMode === 'multiplier' ? 'active' : ''} aria-pressed={paidMode === 'multiplier'} onClick={() => setPaidMode('multiplier')}>按工资倍率</button><button type="button" className={paidMode === 'fixed' ? 'active' : ''} aria-pressed={paidMode === 'fixed'} onClick={() => setPaidMode('fixed')}>固定加班费</button></div></fieldset>
        {paidMode === 'multiplier' ? <fieldset className="overtime-multiplier-field"><legend>选择工资倍率</legend><div className="overtime-multiplier-grid">{OVERTIME_MULTIPLIERS.map(value => <button key={value} type="button" className={multiplier === value ? 'active' : ''} aria-pressed={multiplier === value} onClick={() => setMultiplier(value)}>{value}倍</button>)}</div><p>按你的正常秒薪 × {multiplier} 倍实时计算。</p></fieldset> : <label className="overtime-fixed-field"><span>本次固定加班费</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => setFixedAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div><small>固定金额按本次加班总额计算。</small></label>}
        <div className="overtime-dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setStep('pay-confirm')}><ArrowLeft size={15}/>返回</button><button type="submit" className="dialog-confirm"><BadgeDollarSign size={16}/>开始加班</button></div>
      </>}
    </form>
  </div>, document.body)
}
