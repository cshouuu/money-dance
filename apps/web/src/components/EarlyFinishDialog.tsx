import { CalendarCheck2, Clock3, WalletCards, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatDuration } from '@salary-flow/core'
import './ConfirmDialog.css'
import './EarlyFinishDialog.css'
import { useModalViewport } from './useModalViewport'

interface EarlyFinishDialogProps {
  open: boolean
  workedSeconds: number
  targetSeconds: number
  actualAmount: number
  fullDayAmount: number
  onActual: () => void
  onFullDay: () => void
  onAttendance: () => void
  onCancel: () => void
}

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function EarlyFinishDialog({ open, workedSeconds, targetSeconds, actualAmount, fullDayAmount, onActual, onFullDay, onAttendance, onCancel }: EarlyFinishDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(true)
  useModalViewport(open)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = true
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
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
  }, [open, onCancel])

  if (!open) return null

  return createPortal(<div className="dialog-backdrop early-finish-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <div ref={dialogRef} className="confirm-dialog early-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="early-finish-title" aria-describedby="early-finish-description">
      <div className="early-finish-header"><div><p className="eyebrow">WORK SETTLEMENT</p><h2 id="early-finish-title">今天还没到目标工时</h2></div><button ref={closeButtonRef} type="button" aria-label="取消结束工作" onClick={onCancel}><X size={18}/></button></div>
      <p id="early-finish-description">今天实际计薪 {formatDuration(workedSeconds)}，目标 {formatDuration(targetSeconds)}。这次如何记入账本？</p>
      <div className="early-finish-options">
        <button type="button" onClick={() => { restoreFocusRef.current = false; onActual() }}><Clock3 size={19}/><span><b>按实际时长计薪</b><small>按已工作的 {formatDuration(workedSeconds)} 记入 {money(actualAmount)}</small></span></button>
        <button type="button" onClick={() => { restoreFocusRef.current = false; onFullDay() }}><WalletCards size={19}/><span><b>按正常出勤计全天工资</b><small>按完整日薪 {money(fullDayAmount)} 记入</small></span></button>
        <button type="button" className="attendance-option" onClick={() => { restoreFocusRef.current = false; onAttendance() }}><CalendarCheck2 size={19}/><span><b>调整今天的出勤情况</b><small>设置请假、特殊出勤或固定金额</small></span></button>
      </div>
      <p className="early-finish-note">关闭弹窗会取消本次结束操作，并保持当前工作状态。</p>
    </div>
  </div>, document.body)
}
