import { useEffect, useState } from 'react'
import { keys, STORAGE_CHANGED_EVENT } from './storage'
import { loadWishStore } from './wishStore'

const observed = new Set([keys.wishes, keys.wishAllocation, keys.workRecords, keys.attendanceRecords])

export function useWishStore() {
  const [store, setStore] = useState(loadWishStore)
  useEffect(() => {
    let timer: number | undefined
    const refresh = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<{ key?: string }>).detail?.key
      if (key && !observed.has(key)) return
      // A logical save can touch several keys; read after all writes/rollbacks.
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setStore(loadWishStore()), 0)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(STORAGE_CHANGED_EVENT, refresh)
    return () => { window.clearTimeout(timer); window.removeEventListener('storage', refresh); window.removeEventListener(STORAGE_CHANGED_EVENT, refresh) }
  }, [])
  return store
}
