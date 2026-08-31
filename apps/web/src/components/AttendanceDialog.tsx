import { CalendarCheck2, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LEAVE_TYPES } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import type { AttendanceLeavePeriod, AttendancePayMode, AttendanceRecord, AttendanceStatus, LeaveType } from '../types'
import { useDialogFocus } from './useDialogFocus'
import { useModalViewport } from './useModalViewport'
import './AttendanceDialog.css'

interface AttendanceDialogProps {
  open: boolean
  date: string
  record?: AttendanceRecord
  onSave: (record: AttendanceRecord) => boolean | Promise<boolean>
  onReset: () => boolean | Promise<boolean>
  onCancel: () => void
}

type AttendanceSelection = 'automatic' | AttendanceStatus

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export function AttendanceDialog({ open, date, record, onSave, onReset, onCancel }: AttendanceDialogProps) {
  const [status, setStatus] = useState<AttendanceSelection>('automatic')
  const [leaveType, setLeaveType] = useState<LeaveType>('personal')
  const [leavePeriod, setLeavePeriod] = useState<AttendanceLeavePeriod>('full-day')
  const [payEnabled, setPayEnabled] = useState(false)
  const [payMode, setPayMode] = useState<Exclude<AttendancePayMode, 'unpaid'>>('multiplier')
  const [multiplier, setMultiplier] = useState('1')
  const [fixedAmount, setFixedAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    const nextMode = record?.payMode
    setStatus(record?.status ?? 'automatic')
    setLeaveType(record?.leaveType ?? 'personal')
    setLeavePeriod(record?.leavePeriod === 'morning' || record?.leavePeriod === 'afternoon' ? record.leavePeriod : 'full-day')
    setPayEnabled(Boolean(nextMode && nextMode !== 'unpaid'))
    setPayMode(nextMode === 'fixed' ? 'fixed' : 'multiplier')
    setMultiplier(record?.multiplier === undefined ? '1' : String(record.multiplier))
    setFixedAmount(record?.fixedAmount === undefined ? '' : String(record.fixedAmount))
    setSaving(false)
    setSaveError('')
  }, [date, open, record])
  useDialogFocus(open, onCancel, dialogRef, closeButtonRef)

  if (!open) return null

  const selectStatus = (nextStatus: AttendanceSelection) => {
    if (nextStatus === status) return
    setStatus(nextStatus)
    setSaveError('')
    setLeavePeriod('full-day')
    setPayEnabled(false)
    setPayMode('multiplier')
    setMultiplier('1')
    setFixedAmount('')
  }

  const persist = async (save: () => boolean | Promise<boolean>) => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      if (!await save()) setSaveError('保存失败，请检查设备存储空间后重试。')
    } catch {
      setSaveError('保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    if (status === 'automatic') {
      await persist(onReset)
      return
    }
    let nextRecord: AttendanceRecord
    if (status === 'normal' && !payEnabled) {
      nextRecord = { date, status, updatedAt: new Date().toISOString() }
    } else if (status !== 'normal' && !payEnabled) {
      nextRecord = { date, status, ...(status === 'leave' ? { leaveType, ...(leavePeriod === 'full-day' ? {} : { leavePeriod }) } : {}), payMode: 'unpaid', updatedAt: new Date().toISOString() }
    } else if (payMode === 'multiplier') {
      const value = parseNumberInput(multiplier)
      if (value === null || value <= 0 || value > 100) return
      nextRecord = { date, status, ...(status === 'leave' ? { leaveType, ...(leavePeriod === 'full-day' ? {} : { leavePeriod }) } : {}), payMode, multiplier: value, updatedAt: new Date().toISOString() }
    } else {
      const value = parseNumberInput(fixedAmount)
      if (value === null || value <= 0 || value > MAX_MONEY_AMOUNT) return
      nextRecord = { date, status, ...(status === 'leave' ? { leaveType, ...(leavePeriod === 'full-day' ? {} : { leavePeriod }) } : {}), payMode, fixedAmount: value, updatedAt: new Date().toISOString() }
    }
    await persist(() => onSave(nextRecord))
  }

  return createPortal(<div className="dialog-backdrop attendance-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <form ref={dialogRef} className="attendance-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title" onSubmit={submit}>
      <div className="attendance-dialog-header"><div><p className="eyebrow">ATTENDANCE DETAIL</p><h2 id="attendance-dialog-title">调整出勤情况</h2><span><CalendarCheck2 size={14}/>{formatDate(date)}</span></div><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}><X size={18}/></button></div>

      <fieldset className="attendance-field"><legend>这一天怎么过的？</legend><div className="attendance-switch attendance-status-switch"><button type="button" className={status === 'automatic' ? 'active' : ''} aria-pressed={status === 'automatic'} onClick={() => selectStatus('automatic')}>自动判断</button><button type="button" className={status === 'normal' ? 'active' : ''} aria-pressed={status === 'normal'} onClick={() => selectStatus('normal')}>正常上班</button><button type="button" className={status === 'leave' ? 'active' : ''} aria-pressed={status === 'leave'} onClick={() => selectStatus('leave')}>请假</button><button type="button" className={status === 'holiday' ? 'active' : ''} aria-pressed={status === 'holiday'} onClick={() => selectStatus('holiday')}>放假</button></div></fieldset>

      {status === 'automatic' ? <div className="attendance-automatic-card"><b>跟随自动判断</b><span>不会创建手工出勤记录，将继续按中国大陆节假日、调休补班及工作周规则计算。</span></div> : <div className="attendance-detail-fields">
        {status === 'leave' && <>
          <label><span>请假类型</span><select value={leaveType} onChange={event => setLeaveType(event.target.value as LeaveType)}>{LEAVE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <fieldset className="attendance-field attendance-leave-period-field"><legend>请多久？</legend><div className="attendance-switch attendance-leave-period-switch"><button type="button" className={leavePeriod === 'full-day' ? 'active' : ''} aria-pressed={leavePeriod === 'full-day'} onClick={() => setLeavePeriod('full-day')}>全天</button><button type="button" className={leavePeriod === 'morning' ? 'active' : ''} aria-pressed={leavePeriod === 'morning'} onClick={() => setLeavePeriod('morning')}>上午半天</button><button type="button" className={leavePeriod === 'afternoon' ? 'active' : ''} aria-pressed={leavePeriod === 'afternoon'} onClick={() => setLeavePeriod('afternoon')}>下午半天</button></div></fieldset>
        </>}
        {status === 'normal'
          ? <fieldset className="attendance-field"><legend>当天工资怎么计算？</legend><div className="attendance-switch attendance-normal-pay-switch"><button type="button" className={!payEnabled ? 'active' : ''} aria-pressed={!payEnabled} onClick={() => setPayEnabled(false)}>默认工资</button><button type="button" className={payEnabled && payMode === 'multiplier' ? 'active' : ''} aria-pressed={payEnabled && payMode === 'multiplier'} onClick={() => { setPayEnabled(true); setPayMode('multiplier') }}>工资倍率</button><button type="button" className={payEnabled && payMode === 'fixed' ? 'active' : ''} aria-pressed={payEnabled && payMode === 'fixed'} onClick={() => { setPayEnabled(true); setPayMode('fixed') }}>固定金额</button></div></fieldset>
          : <fieldset className="attendance-field"><legend>{status === 'holiday' ? '放假类型' : '当天是否计薪？'}</legend><div className="attendance-switch"><button type="button" className={!payEnabled ? 'active' : ''} aria-pressed={!payEnabled} onClick={() => setPayEnabled(false)}>{status === 'holiday' ? '无薪假' : '不计薪'}</button><button type="button" className={payEnabled ? 'active' : ''} aria-pressed={payEnabled} onClick={() => setPayEnabled(true)}>{status === 'holiday' ? '带薪假' : '计薪'}</button></div></fieldset>}
        {payEnabled && <div className="attendance-pay-card">
          {status !== 'normal' && <div className="attendance-pay-tabs" role="group" aria-label="计薪方式"><button type="button" className={payMode === 'multiplier' ? 'active' : ''} aria-pressed={payMode === 'multiplier'} onClick={() => setPayMode('multiplier')}>按工资倍率</button><button type="button" className={payMode === 'fixed' ? 'active' : ''} aria-pressed={payMode === 'fixed'} onClick={() => setPayMode('fixed')}>固定金额</button></div>}
          {payMode === 'multiplier' ? <label><span>{status === 'holiday' ? '假期工资倍率' : status === 'normal' ? '正常出勤工资倍率' : leavePeriod === 'full-day' ? '工资倍率' : '半天请假工资倍率'}</span><div className="attendance-suffix-input"><input required type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={multiplier} onKeyDown={preventInvalidNumberKey} onChange={event => setMultiplier(normalizeDecimalInput(event.target.value))} placeholder="例如 0.8"/><i>倍</i></div><small>{status === 'leave' && leavePeriod !== 'full-day' ? '当天工资 = 半日正常工资 + 半日标准工资 × 这个倍率' : `${status === 'holiday' ? '当天假期工资' : '当天工作收入'} = 标准日薪 × 这个倍率`}</small></label> : <label><span>{status === 'holiday' ? '当天假期工资' : status === 'normal' ? '当天正常出勤工资' : leavePeriod === 'full-day' ? '当天固定收入' : '请假半天固定工资'}</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} onKeyDown={preventInvalidNumberKey} onChange={event => setFixedAmount(normalizeDecimalInput(event.target.value))} placeholder="0.00"/></div><small>{status === 'leave' && leavePeriod !== 'full-day' ? '当天工资 = 半日正常工资 + 这里填写的请假半天工资。' : '保存后，以这笔金额覆盖当天的自动工资。'}</small></label>}
        </div>}
      </div>}

      <p className="attendance-dialog-note">{status === 'automatic' ? '使用自动判断不会新增手工记录；如果这一天已有手工出勤，则会在成功移除后恢复自动规则。' : '保存后，账本中这一天的工资收入会立即重新计算。半天无薪假保留半日正常工资；倍率或固定金额只作用于请假半日，再与另外半日的正常工资相加。出勤设置会优先于已有的手工工资调整。'}</p>
      {saveError && <p className="attendance-save-error" role="alert">{saveError}</p>}
      <div className={`attendance-dialog-actions${record ? ' has-reset' : ''}`}>{record && <button type="button" className="attendance-reset" disabled={saving} onClick={() => void persist(onReset)}>恢复自动判断</button>}<button type="button" className="dialog-cancel" disabled={saving} onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm" disabled={saving}>{saving ? '保存中…' : status === 'automatic' ? '使用自动判断' : '保存出勤'}</button></div>
    </form>
  </div>, document.body)
}
