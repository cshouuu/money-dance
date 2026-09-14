import { NAVIGATION_ITEMS, type NavigationPath } from './navigation'
import { keys, loadJSON, saveJSON, STORAGE_CHANGED_EVENT } from './storage'

export const DEFAULT_DOCK_PATHS: readonly NavigationPath[] = ['/', '/slacking', '/overtime', '/settings']
const allowedPaths = new Set<string>(NAVIGATION_ITEMS.map(([path]) => path))

/** Retain valid choices and fill missing positions when saved settings are outdated or damaged. */
export function normalizeDockPaths(value: unknown): NavigationPath[] {
  const candidates = Array.isArray(value) ? value : []
  return [...new Set([...candidates, ...DEFAULT_DOCK_PATHS, ...allowedPaths]
    .filter((path): path is NavigationPath => typeof path === 'string' && allowedPaths.has(path)))].slice(0, 4)
}

export function loadDockPaths(): NavigationPath[] {
  return normalizeDockPaths(loadJSON<unknown>(keys.mobileDock, null))
}

export function setDockSlot(paths: readonly NavigationPath[], index: number, path: NavigationPath): NavigationPath[] {
  const next = normalizeDockPaths(paths)
  if (!Number.isInteger(index) || index < 0 || index >= 4 || !allowedPaths.has(path)) return next
  const previousIndex = next.indexOf(path)
  if (previousIndex !== -1) next[previousIndex] = next[index]
  next[index] = path
  return next
}

export function saveDockPaths(paths: readonly NavigationPath[]): boolean {
  if (paths.length !== 4 || new Set(paths).size !== 4 || paths.some(path => !allowedPaths.has(path))) return false
  return saveJSON(keys.mobileDock, paths)
}

export function subscribeDockPaths(onChange: (paths: NavigationPath[]) => void): () => void {
  const refresh = (event: Event) => {
    const key = event.type === 'storage' ? (event as StorageEvent).key : (event as CustomEvent<{ key: string }>).detail?.key
    if (key && key !== keys.mobileDock) return
    onChange(loadDockPaths())
  }
  window.addEventListener('storage', refresh)
  window.addEventListener(STORAGE_CHANGED_EVENT, refresh)
  return () => {
    window.removeEventListener('storage', refresh)
    window.removeEventListener(STORAGE_CHANGED_EVENT, refresh)
  }
}
