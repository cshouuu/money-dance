import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateTime, toLocalDateValue } from '../lib/form'
import { summaryEntryDateValue, type SummaryEntry } from '../lib/ledger'
import type { LedgerDirection } from '../types'
import { Input, Tabs, TabsTrigger } from '../ui/BeuiControls'
import './LedgerEntryDialog.css'
import { useModalViewport } from './useModalViewport'

export interface LedgerEntryDraft {
  direction: LedgerDirection
  amount: number
  source: string
  occurredAt: string
  localDate: string
}

interface LedgerEntryDialogProps {
  open: boolean
  entry: SummaryEntry | null
  initialDate: string
  onSave: (draft: LedgerEntryDraft) => void
  onCancel: () => void
}

export function LedgerEntryDialog({ open, entry, initialDate, onSave, onCancel }: LedgerEntryDialogProps) {
  const [direction, setDirection] = useState<LedgerDirection>('expense')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [date, setDate] = useState(initialDate)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    setDirection(entry?.direction ?? 'expense')
    setAmount(entry ? String(entry.amount) : '')
    setSource(entry?.source ?? '')
    setDate(entry ? summaryEntryDateValue(entry) : initialDate)
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, entry, initialDate, onCancel])

  if (!open) return null
  const salaryDateLocked = Boolean(entry?.generated || entry?.kind === 'salary_override')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAmount = parseNumberInput(amount)
    if (!event.currentTarget.reportValidity() || !source.trim() || parsedAmount === null || parsedAmount <= 0 || parsedAmount > MAX_MONEY_AMOUNT) return
    onSave({ direction, amount: parsedAmount, source: source.trim(), occurredAt: toLocalDateTime(date).toISOString(), localDate: date })
  }

  return createPortal(<div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form className="ledger-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-entry-dialog-title" onSubmit={submit}>
      <div className="ledger-dialog-header"><div><p className="eyebrow">LEDGER DETAIL</p><h2 id="ledger-entry-dialog-title">{entry ? '编辑收支明细' : '记一笔收支'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      <fieldset className="ledger-direction-field"><legend>收支类型</legend><Tabs className="direction-switch" value={direction} onValueChange={value=>setDirection(value as LedgerDirection)}><TabsTrigger value="expense" tone="expense"><ArrowUpRight size={15}/>支出</TabsTrigger><TabsTrigger value="income" tone="income"><ArrowDownLeft size={15}/>收入</TabsTrigger></Tabs></fieldset>
      <div className="ledger-dialog-fields"><Input label="明细名称" required maxLength={50} value={source} onValueChange={setSource} placeholder="例如：午餐、兼职收入"/><Input label="金额" required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={amount} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value=>setAmount(normalizeDecimalInput(value))} placeholder="0.00"/><Input label="发生日期" required type="date" max={toLocalDateValue()} value={date} disabled={salaryDateLocked} onValueChange={setDate}/></div>
      {salaryDateLocked && <p className="ledger-dialog-note">工资调整会继续对应原工资，所属日期不可修改；保存后以手工金额为准。</p>}
      <div className="ledger-dialog-actions"><button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm">{entry ? '保存调整' : '添加明细'}</button></div>
    </form>
  </div>, document.body)
}
