export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export const keys = {
  profile: 'salary-flow.profile.v1',
  wishes: 'salary-flow.wishes.v1',
  sessions: 'salary-flow.sessions.v1',
  activeSlacking: 'salary-flow.active-slacking.v1',
  assets: 'salary-flow.assets.v1',
}
