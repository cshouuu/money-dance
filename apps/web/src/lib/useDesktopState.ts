import { useEffect, useState } from 'react'
import { desktop, type DesktopState } from './desktop'
export function useDesktopState() {
  const [state, setState] = useState<DesktopState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!desktop) return
    let disposed = false
    const unsubscribe = desktop.onState(update => setState(previous => previous ? { ...previous, ...update } : previous))
    desktop.getState().then(next => { if (!disposed) setState(next) }).catch(() => { if (!disposed) setError('无法连接桌宠，请退出并重新打开 MoneyDance。') })
    return () => { disposed = true; unsubscribe() }
  }, [])
  return { state, setState, error }
}
