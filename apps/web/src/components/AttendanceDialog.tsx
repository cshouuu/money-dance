import { CalendarCheck2, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LEAVE_TYPES } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import type { AttendancePayMode, AttendanceRecord, AttendanceStatus, LeaveType } from '../types'
import { useModalViewport } from './useModalViewport'
import './AttendanceDialog.css'

interface AttendanceDialogProps {
  open: boolean
  date: string
  record?: AttendanceRecord
  onSave: (record: AttendanceRecord) => void
  onReset: () => void
  onCancel: () => void
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export function AttendanceDialog({ open, date, record, onSave, onReset, onCancel }: AttendanceDialogProps) {
  const [status, setStatus] = useState<AttendanceStatus>('normal')
  const [leaveType, setLeaveType] = useState<LeaveType>('personal')
  const [paid, setPaid] = useState(false)
  const [payMode, setPayMode] = useState<Exclude<AttendancePayMode, 'unpaid'>>('multiplier')
  const [multiplier, setMultiplier] = useState('1')
  const [fixedAmount, setFixedAmount] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    const nextMode = record?.payMode
    setStatus(record?.status ?? 'normal')
    setLeaveType(record?.leaveType ?? 'personal')
    setPaid(Boolean(nextMode && nextMode !== 'unpaid'))
    setPayMode(nextMode === 'fixed' ? 'fixed' : 'multiplier')
    setMultiplier(record?.multiplier === undefined ? '1' : String(record.multiplier))
    setFixedAmount(record?.fixedAmount === undefined ? '' : String(record.fixedAmount))
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, record, onCancel])

  if (!open) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    if (status === 'normal') {
      onSave({ date, status, updatedAt: new Date().toISOString() })
      return
    }

    if (!paid) {
      onSave({ date, status, leaveType, payMode: 'unpaid', updatedAt: new Date().toISOString() })
      return
    }

    if (payMode === 'multiplier') {
      const value = parseNumberInput(multiplier)
      if (value === null || value <= 0 || value > 100) return
      onSave({ date, status, leaveType, payMode, multiplier: value, updatedAt: new Date().toISOString() })
      return
    }

    const value = parseNumberInput(fixedAmount)
    if (value === null || value <= 0 || value > MAX_MONEY_AMOUNT) return
    onSave({ date, status, leaveType, payMode, fixedAmount: value, updatedAt: new Date().toISOString() })
  }

  return createPortal(<div className="dialog-backdrop attendance-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form className="attendance-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title" onSubmit={submit}>
      <div className="attendance-dialog-header"><div><p className="eyebrow">ATTENDANCE DETAIL</p><h2 id="attendance-dialog-title">调整出勤情况</h2><span><CalendarCheck2 size={14}/>{formatDate(date)}</span></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>

      <fieldset className="attendance-field"><legend>这一天怎么过的？</legend><div className="attendance-switch"><button type="button" className={status === 'normal' ? 'active' : ''} aria-pressed={status === 'normal'} onClick={() => setStatus('normal')}>正常上班</button><button type="button" className={status === 'leave' ? 'active' : ''} aria-pressed={status === 'leave'} onClick={() => setStatus('leave')}>请假 / 特殊出勤</button></div></fieldset>

      {status === 'leave' && <div className="attendance-leave-fields">
        <label><span>请假类型</span><select value={leaveType} onChange={event => setLeaveType(event.target.value as LeaveType)}>{LEAVE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <fieldset className="attendance-field"><legend>当天是否计薪？</legend><div className="attendance-switch"><button type="button" className={!paid ? 'active' : ''} aria-pressed={!paid} onClick={() => setPaid(false)}>不计薪</button><button type="button" className={paid ? 'active' : ''} aria-pressed={paid} onClick={() => setPaid(true)}>计薪</button></div></fieldset>
        {paid && <div className="attendance-pay-card">
          <div className="attendance-pay-tabs" role="group" aria-label="计薪方式"><button type="button" className={payMode === 'multiplier' ? 'active' : ''} aria-pressed={payMode === 'multiplier'} onClick={() => setPayMode('multiplier')}>按工资倍率</button><button type="button" className={payMode === 'fixed' ? 'active' : ''} aria-pressed={payMode === 'fixed'} onClick={() => setPayMode('fixed')}>固定金额</button></div>
          {payMode === 'multiplier' ? <label><span>工资倍率</span><div className="attendance-suffix-input"><input required type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={multiplier} onKeyDown={preventInvalidNumberKey} onChange={event => setMultiplier(normalizeDecimalInput(event.target.value))} placeholder="例如 0.8"/><i>倍</i></div><small>当天工作收入 = 正常日薪 × 这个倍率</small></label> : <label><span>当天固定收入</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => setFixedAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div><small>保存后，以这笔金额替换当天的自动工资。</small></label>}
        </div>}
      </div>}

      <p className="attendance-dialog-note">保存后，账本中这一天的工资收入会立即重新计算。出勤设置会优先于已有的手工工资调整；恢复自动判断后，原调整会重新生效。</p>
      <div className={`attendance-dialog-actions${record ? ' has-reset' : ''}`}>{record && <button type="button" className="attendance-reset" onClick={onReset}>恢复自动判断</button>}<button type="button" className="dialog-cancel" onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm">保存出勤</button></div>
    </form>
  </div>, document.body)
}
