export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeJSON(key: string): boolean {
  try {
    localStorage.removeItem(key)
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
  assets: 'salary-flow.assets.v1',
  ledger: 'salary-flow.ledger.v1',
  workRecords: 'salary-flow.work-records.v1',
  attendanceRecords: 'salary-flow.attendance-records.v1',
}
