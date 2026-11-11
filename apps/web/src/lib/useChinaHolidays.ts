import { useEffect, useState, useSyncExternalStore } from 'react'
import { CHINA_HOLIDAY_SETTINGS_KEY, loadChinaHolidaySettings } from './attendance'
import { CHINA_HOLIDAY_DATA_KEY, getChinaHolidayData } from './chinaHolidays'
import { STORAGE_CHANGED_EVENT } from './storage'

function subscribe(refresh: () => void): () => void {
  const onStorage = (event: Event) => {
    const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<{ key: string }>).detail?.key
    if (!key || key === CHINA_HOLIDAY_DATA_KEY || key === CHINA_HOLIDAY_SETTINGS_KEY) refresh()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(STORAGE_CHANGED_EVENT, onStorage)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(STORAGE_CHANGED_EVENT, onStorage)
  }
}

export function useChinaHolidayData() {
  return useSyncExternalStore(subscribe, getChinaHolidayData, getChinaHolidayData)
}

export function useChinaHolidaySettings() {
  const [settings, setSettings] = useState(loadChinaHolidaySettings)
  useEffect(() => {
    const refresh = () => {
      const next = loadChinaHolidaySettings()
      setSettings(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const unsubscribe = subscribe(refresh)
    refresh()
    return unsubscribe
  }, [])
  return settings
}
