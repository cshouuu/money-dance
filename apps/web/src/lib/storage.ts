export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export const STORAGE_CHANGED_EVENT = 'money-dance:storage-changed'

function notifyStorageChanged(key: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT, { detail: { key } }))
}

export function saveJSON<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    notifyStorageChanged(key)
    return true
  } catch {
    return false
  }
}

export function removeJSON(key: string): boolean {
  try {
    localStorage.removeItem(key)
    notifyStorageChanged(key)
    return true
  } catch {
    return false
  }
}

export const keys = {
  profile: 'salary-flow.profile.v1',
  wishes: 'salary-flow.wishes.v1',
  sessions: 'salary-flow.sessions.v1',
  activeSlacking: 'salary-flow.active-slacking.v1',
  overtimeSessions: 'salary-flow.overtime-sessions.v1',
  activeOvertime: 'salary-flow.active-overtime.v1',
  achievements: 'salary-flow.achievements.v1',
  assets: 'salary-flow.assets.v1',
  ledger: 'salary-flow.ledger.v1',
  workRecords: 'salary-flow.work-records.v1',
  attendanceRecords: 'salary-flow.attendance-records.v1',
}
