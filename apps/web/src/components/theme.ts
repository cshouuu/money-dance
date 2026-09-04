import { loadJSON, saveJSON } from '../lib/storage'

export const THEMES = [
  { id: 'classic', name: '经典薪流', colorNames: '深林绿 · 青柠米', colors: ['#1E281F', '#DFE8B6'], browserColor: '#F5F2EA' },
  { id: 'cloud-river', name: '绸云晴川', colorNames: '绸云黄 · 晴川蓝', colors: ['#F4DC84', '#79BEDF'], browserColor: '#F7F2E3' },
  { id: 'cobalt-ivory', name: '沧溟玉釉', colorNames: '沧溟蓝 · 玉釉杏', colors: ['#0E61AC', '#FAF2E0'], browserColor: '#F7F5EF' },
  { id: 'frost-cyan', name: '霜绒岫烟', colorNames: '霜绒白 · 岫烟青', colors: ['#FCF9E8', '#00B7C7'], browserColor: '#F8F6F1' },
  { id: 'rose-moon', name: '玫瑰月白', colorNames: '玫瑰粉 · 月白色', colors: ['#D87888', '#E8F0F2'], browserColor: '#F5F5F2' },
  { id: 'misty-hill', name: '青岚云绒', colorNames: '青岚色 · 云绒色', colors: ['#73AE52', '#FBF1D7'], browserColor: '#F8F5EE' },
  { id: 'peach-sprout', name: '桃杏青芽', colorNames: '桃杏暖 · 青芽绿', colors: ['#FFCB9A', '#BCE4BC'], browserColor: '#F8F0E6' },
  { id: 'lemon-taro', name: '柠檬星芋', colorNames: '柠檬黄 · 星芋紫', colors: ['#FFE831', '#8274FF'], browserColor: '#F8F4D7' },
  { id: 'mist-coral', name: '雾涧珊瑚', colorNames: '雾涧白 · 珊瑚桃', colors: ['#E0FFF4', '#F2A191'], browserColor: '#F4F7F2' },
  { id: 'aqua-peach', name: '水雾云桃', colorNames: '水雾青 · 云桃粉', colors: ['#B7FFFC', '#FFCEDE'], browserColor: '#F8F0EF' },
  { id: 'cream-grass', name: '奶油雾草', colorNames: '奶油杏 · 雾草绿', colors: ['#FFEAD5', '#9BCC9A'], browserColor: '#F8F4EE' },
  { id: 'cyan-tide', name: '青蓝沧浪', colorNames: '青蓝 · 沧浪', colors: ['#00B7C7', '#B1D5C9'], browserColor: '#EDF1EC' },
] as const

export type ThemeId = typeof THEMES[number]['id']

export const DEFAULT_THEME_ID: ThemeId = 'classic'
export const THEME_CHANGED_EVENT = 'money-dance:theme-changed'
export const THEME_STORAGE_KEY = 'salary-flow.theme.v1'

const themeIds = new Set<string>(THEMES.map(theme => theme.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.has(value)
}

export function loadThemeId(): ThemeId {
  const stored = loadJSON<unknown>(THEME_STORAGE_KEY, DEFAULT_THEME_ID)
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID
}

export function getTheme(themeId: ThemeId) {
  return THEMES.find(theme => theme.id === themeId) ?? THEMES[0]
}

export function applyTheme(themeId: ThemeId): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', getTheme(themeId).browserColor)
}

export function initializeTheme(): ThemeId {
  const themeId = loadThemeId()
  applyTheme(themeId)
  return themeId
}

export function selectTheme(themeId: ThemeId): boolean {
  applyTheme(themeId)
  const persisted = saveJSON(THEME_STORAGE_KEY, themeId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { themeId, persisted } }))
  }
  return persisted
}

export function currentThemeId(): ThemeId {
  if (typeof document !== 'undefined' && isThemeId(document.documentElement.dataset.theme)) {
    return document.documentElement.dataset.theme
  }
  return loadThemeId()
}

export function subscribeToTheme(listener: (themeId: ThemeId) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onThemeChange = () => listener(currentThemeId())
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return
    const themeId = loadThemeId()
    applyTheme(themeId)
    listener(themeId)
  }
  window.addEventListener(THEME_CHANGED_EVENT, onThemeChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, onThemeChange)
    window.removeEventListener('storage', onStorage)
  }
}
