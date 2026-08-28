import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateTime, toLocalDateValue } from '../lib/form'
import type { SummaryEntry } from '../lib/ledger'
import type { LedgerDirection } from '../types'
import './LedgerEntryDialog.css'

export interface LedgerEntryDraft {
  direction: LedgerDirection
  amount: number
  source: string
  occurredAt: string
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
  const sourceRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setDirection(entry?.direction ?? 'expense')
    setAmount(entry ? String(entry.amount) : '')
    setSource(entry?.source ?? '')
    setDate(entry ? toLocalDateValue(new Date(entry.occurredAt)) : initialDate)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      if (entry) closeButtonRef.current?.focus()
      else sourceRef.current?.focus()
    }, 0)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, entry, initialDate, onCancel])

  if (!open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAmount = parseNumberInput(amount)
    if (!event.currentTarget.reportValidity() || !source.trim() || parsedAmount === null || parsedAmount <= 0 || parsedAmount > MAX_MONEY_AMOUNT) return
    onSave({ direction, amount: parsedAmount, source: source.trim(), occurredAt: toLocalDateTime(date).toISOString() })
  }

  return createPortal(<div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form className="ledger-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-entry-dialog-title" onSubmit={submit}>
      <div className="ledger-dialog-header"><div><p className="eyebrow">LEDGER DETAIL</p><h2 id="ledger-entry-dialog-title">{entry ? '编辑收支明细' : '记一笔收支'}</h2></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>
      <fieldset className="ledger-direction-field"><legend>收支类型</legend><div className="direction-switch"><button type="button" className={direction==='expense'?'active expense':''} aria-pressed={direction==='expense'} onClick={()=>setDirection('expense')}><ArrowUpRight size={15}/>支出</button><button type="button" className={direction==='income'?'active income':''} aria-pressed={direction==='income'} onClick={()=>setDirection('income')}><ArrowDownLeft size={15}/>收入</button></div></fieldset>
      <div className="ledger-dialog-fields"><label><span>明细名称</span><input ref={sourceRef} required maxLength={50} value={source} onChange={event=>setSource(event.target.value)} placeholder="例如：午餐、兼职收入"/></label><label><span>金额</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={amount} onKeyDown={preventInvalidNumberKey} onChange={event=>setAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div></label><label><span>发生日期</span><input required type="date" max={toLocalDateValue()} value={date} onChange={event=>setDate(event.target.value)}/></label></div>
      {entry?.generated && <p className="ledger-dialog-note">这是自动生成的工资明细。保存后会以你的手工调整为准。</p>}
      <div className="ledger-dialog-actions"><button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm">{entry ? '保存调整' : '添加明细'}</button></div>
    </form>
  </div>, document.body)
}
