import { useEffect, useState } from 'react'
import { loadProfile } from './profile'
import { keys, STORAGE_CHANGED_EVENT } from './storage'

export function useProfile() {
  const [profile, setProfile] = useState(loadProfile)
  useEffect(() => {
    const refresh = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<{ key: string }>).detail?.key
      if (key && key !== keys.profile) return
      const next = loadProfile()
      setProfile(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(STORAGE_CHANGED_EVENT, refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(STORAGE_CHANGED_EVENT, refresh) }
  }, [])
  return profile
}
