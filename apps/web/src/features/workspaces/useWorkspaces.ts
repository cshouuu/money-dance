import { useEffect, useState } from 'react'
import { STORAGE_CHANGED_EVENT } from '../../lib/storage'
import { loadSpaces } from '../../lib/workspaces/store'

export function useWorkspaces() {
  const [spaces, setSpaces] = useState(loadSpaces)
  useEffect(() => {
    const refresh = () => {
      const next = loadSpaces()
      setSpaces(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(STORAGE_CHANGED_EVENT, refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(STORAGE_CHANGED_EVENT, refresh) }
  }, [])
  return spaces
}
