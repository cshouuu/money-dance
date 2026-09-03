import { CalendarCheck2, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LEAVE_TYPES } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import type { AttendanceLeavePeriod, AttendancePayMode, AttendanceRecord, AttendanceStatus, LeaveType } from '../types'
import { Input, SelectField, Tabs, TabsTrigger } from '../ui/BeuiControls'
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

      <fieldset className="attendance-field"><legend>这一天怎么过的？</legend><Tabs className="attendance-switch attendance-status-switch" value={status} onValueChange={value => selectStatus(value as AttendanceSelection)}><TabsTrigger value="automatic">自动判断</TabsTrigger><TabsTrigger value="normal">正常上班</TabsTrigger><TabsTrigger value="leave">请假</TabsTrigger><TabsTrigger value="holiday">放假</TabsTrigger></Tabs></fieldset>

      {status === 'automatic' ? <div className="attendance-automatic-card"><b>跟随自动判断</b><span>不会创建手工出勤记录，将继续按中国大陆节假日、调休补班及工作周规则计算。</span></div> : <div className="attendance-detail-fields">
        {status === 'leave' && <>
          <SelectField label="请假类型" value={leaveType} onValueChange={value => setLeaveType(value as LeaveType)}>{LEAVE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField>
          <fieldset className="attendance-field attendance-leave-period-field"><legend>请多久？</legend><Tabs className="attendance-switch attendance-leave-period-switch" value={leavePeriod} onValueChange={value => setLeavePeriod(value as AttendanceLeavePeriod)}><TabsTrigger value="full-day">全天</TabsTrigger><TabsTrigger value="morning">上午半天</TabsTrigger><TabsTrigger value="afternoon">下午半天</TabsTrigger></Tabs></fieldset>
        </>}
        {status === 'normal'
          ? <fieldset className="attendance-field"><legend>当天工资怎么计算？</legend><Tabs className="attendance-switch attendance-normal-pay-switch" value={!payEnabled ? 'default' : payMode} onValueChange={value => { if (value === 'default') { setPayEnabled(false) } else { setPayEnabled(true); setPayMode(value as Exclude<AttendancePayMode, 'unpaid'>) } }}><TabsTrigger value="default">默认工资</TabsTrigger><TabsTrigger value="multiplier">工资倍率</TabsTrigger><TabsTrigger value="fixed">固定金额</TabsTrigger></Tabs></fieldset>
          : <fieldset className="attendance-field"><legend>{status === 'holiday' ? '放假类型' : '当天是否计薪？'}</legend><Tabs className="attendance-switch" value={payEnabled ? 'paid' : 'unpaid'} onValueChange={value => setPayEnabled(value === 'paid')}><TabsTrigger value="unpaid">{status === 'holiday' ? '无薪假' : '不计薪'}</TabsTrigger><TabsTrigger value="paid">{status === 'holiday' ? '带薪假' : '计薪'}</TabsTrigger></Tabs></fieldset>}
        {payEnabled && <div className="attendance-pay-card">
          {status !== 'normal' && <Tabs className="attendance-pay-tabs" value={payMode} onValueChange={value => setPayMode(value as Exclude<AttendancePayMode, 'unpaid'>)}><TabsTrigger value="multiplier">按工资倍率</TabsTrigger><TabsTrigger value="fixed">固定金额</TabsTrigger></Tabs>}
          {payMode === 'multiplier' ? <Input label={status === 'holiday' ? '假期工资倍率' : status === 'normal' ? '正常出勤工资倍率' : leavePeriod === 'full-day' ? '工资倍率' : '半天请假工资倍率'} required type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={multiplier} rightIcon="倍" onKeyDown={preventInvalidNumberKey} onValueChange={value => setMultiplier(normalizeDecimalInput(value))} placeholder="例如 0.8" hint={status === 'leave' && leavePeriod !== 'full-day' ? '当天工资 = 半日正常工资 + 半日标准工资 × 这个倍率' : `${status === 'holiday' ? '当天假期工资' : '当天工作收入'} = 标准日薪 × 这个倍率`}/> : <Input label={status === 'holiday' ? '当天假期工资' : status === 'normal' ? '当天正常出勤工资' : leavePeriod === 'full-day' ? '当天固定收入' : '请假半天固定工资'} required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={fixedAmount} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => setFixedAmount(normalizeDecimalInput(value))} placeholder="0.00" hint={status === 'leave' && leavePeriod !== 'full-day' ? '当天工资 = 半日正常工资 + 这里填写的请假半天工资。' : '保存后，以这笔金额覆盖当天的自动工资。'}/>}
        </div>}
      </div>}

      <p className="attendance-dialog-note">{status === 'automatic' ? '使用自动判断不会新增手工记录；如果这一天已有手工出勤，则会在成功移除后恢复自动规则。' : '保存后，账本中这一天的工资收入会立即重新计算。半天无薪假保留半日正常工资；倍率或固定金额只作用于请假半日，再与另外半日的正常工资相加。出勤设置会优先于已有的手工工资调整。'}</p>
      {saveError && <p className="attendance-save-error" role="alert">{saveError}</p>}
      <div className={`attendance-dialog-actions${record ? ' has-reset' : ''}`}>{record && <button type="button" className="attendance-reset" disabled={saving} onClick={() => void persist(onReset)}>恢复自动判断</button>}<button type="button" className="dialog-cancel" disabled={saving} onClick={onCancel}>取消</button><button type="submit" className="dialog-confirm" disabled={saving}>{saving ? '保存中…' : status === 'automatic' ? '使用自动判断' : '保存出勤'}</button></div>
    </form>
  </div>, document.body)
}