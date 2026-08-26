import { useEffect } from 'react'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel() }}>
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <p className="eyebrow">JUST CHECKING</p>
      <h2 id="confirm-dialog-title">{title}</h2>
      {message && <p>{message}</p>}
      <div className="confirm-dialog-actions">
        <button type="button" className="dialog-cancel" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="dialog-confirm" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
}
