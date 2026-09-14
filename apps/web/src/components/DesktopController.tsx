import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { desktop, type PetSnapshot } from '../lib/desktop'
import { buildDesktopSnapshot } from '../lib/desktopSnapshot'
import { loadProfile } from '../lib/profile'
import { loadWorkRecords } from '../lib/work'
import { loadAttendanceRecords } from '../lib/attendance'
import { loadActiveSlacking } from '../lib/slacking'
import { keys, loadJSON, STORAGE_CHANGED_EVENT } from '../lib/storage'
import { loadWishStore } from '../lib/wishStore'
import { evaluateWishAllocation } from '../lib/wishAllocation'
import { calculatePaidTimeEarnings } from '../lib/paidTime'
import type { ActiveOvertime } from '../types'

export function DesktopController() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!desktop) return
    let wish: PetSnapshot['wish'] = null, wishUpdatedAt = 0
    const publish = () => {
      const now = new Date(), profile = loadProfile(), records = loadWorkRecords(), attendance = loadAttendanceRecords()
      const snapshot = buildDesktopSnapshot(profile, records, attendance, loadActiveSlacking(), loadJSON<ActiveOvertime | null>(keys.activeOvertime, null), now)
      // Forecasting is deliberately excluded from this background second tick.
      if (now.getTime() - wishUpdatedAt > 60_000) {
        const store = loadWishStore(), item = store.items.find(item => !item.purchasedAt)
        wish = null
        if (item) {
          const earned = store.plan ? evaluateWishAllocation(store.plan, profile, now, records, attendance).amounts[item.id] ?? 0
            : calculatePaidTimeEarnings(profile, new Date(item.startedAt ?? item.createdAt), now, records, attendance).earnedAmount
          wish = { id: item.id, name: item.name, progress: item.price > 0 ? Math.min(1, Math.max(0, earned / item.price)) : 1 }
        }
        wishUpdatedAt = now.getTime()
      }
      desktop!.publish({ ...snapshot, wish })
    }
    const update = () => { wishUpdatedAt = 0; publish() }
    const unsubscribe = desktop.onNavigate(route => navigate(route))
    publish()
    // Runs while the main window is in the tray; the desktop host disables throttling.
    const timer = window.setInterval(publish, 1000)
    window.addEventListener(STORAGE_CHANGED_EVENT, update)
    window.addEventListener('storage', update)
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener(STORAGE_CHANGED_EVENT, update); window.removeEventListener('storage', update) }
  }, [navigate])
  return null
}
