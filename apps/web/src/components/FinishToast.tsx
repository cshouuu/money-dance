import { Sparkles, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './FinishToast.css'

interface FinishToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export function FinishToast({ message, onClose, duration = 4800 }: FinishToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [duration, message, onClose])

  return createPortal(<div className="finish-toast" role="status" aria-live="polite" aria-atomic="true">
    <span className="finish-toast-icon"><Sparkles size={17}/></span>
    <p>{message}</p>
    <button type="button" aria-label="关闭提醒" onClick={onClose}><X size={16}/></button>
  </div>, document.body)
}
