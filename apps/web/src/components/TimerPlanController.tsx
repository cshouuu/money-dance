import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { reconcileTimerPlans, TIMER_PLANS_UPDATED } from '../lib/timerPlans'

export function useTimerPlanSync(refresh: () => void) {
  const callback = useRef(refresh)
  callback.current = refresh
  useEffect(() => {
    const sync = () => callback.current()
    sync()
    window.addEventListener(TIMER_PLANS_UPDATED, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(TIMER_PLANS_UPDATED, sync); window.removeEventListener('storage', sync) }
  }, [])
}

export function TimerPlanController() {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let busy = false
    let disposed = false
    const run = async () => {
      if (busy || disposed) return
      busy = true
      const reconcile = () => {
        if (disposed) return
        const result = reconcileTimerPlans()
        setError(result.error)
        if (result.changed) window.dispatchEvent(new Event(TIMER_PLANS_UPDATED))
      }
      try {
        if (navigator.locks) await navigator.locks.request('money-dance-timer-plans', { ifAvailable: true }, lock => { if (lock) reconcile() })
        else reconcile()
      } catch { if (!disposed) setError('预约执行失败，请检查设置或释放存储空间后重试。') }
      finally { busy = false }
    }
    void run()
    const interval = window.setInterval(() => void run(), 1000)
    window.addEventListener('focus', run)
    window.addEventListener('pageshow', run)
    document.addEventListener('visibilitychange', run)
    return () => { disposed = true; clearInterval(interval); window.removeEventListener('focus', run); window.removeEventListener('pageshow', run); document.removeEventListener('visibilitychange', run) }
  }, [])
  return error ? <div className="timer-plan-global-error" role="alert">{error} <Link to="/overtime">查看加班</Link> · <Link to="/slacking">查看摸鱼</Link></div> : null
}
