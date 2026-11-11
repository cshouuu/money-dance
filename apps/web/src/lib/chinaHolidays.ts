import bundled from './chinaHolidays.data.json'
import { saveJSON } from './storage'

export type ChinaHolidayDayKind = 'holiday' | 'adjusted-workday'

export interface ChinaHolidayDay {
  date: string
  name: string
  kind: ChinaHolidayDayKind
  /** True only for the statutory paid date, not every day in a long break. */
  statutory?: boolean
}

interface HolidayYearDefinition {
  sourceUrl: string
  holidays: { name: string; start: string; end: string }[]
  statutoryDates: string[]
  adjustedWorkdays: { date: string; name: string }[]
}

export interface ChinaHolidayDataset {
  schemaVersion: number
  version: string
  years: Record<string, HolidayYearDefinition>
}

/** Audited State Council arrangements, also published independently to R2. */
export const CHINA_HOLIDAY_DATA_VERSION = bundled.version
export const SUPPORTED_CHINA_HOLIDAY_YEARS = Object.freeze(Object.keys(bundled.years).map(Number))
export const CHINA_HOLIDAY_DATA_KEY = 'money-dance.china-holiday-data.v1'
export const CHINA_HOLIDAY_DATA_URL = 'https://money-dance-6gl.pages.dev/holidays/china.json'

function dateRange(start: string, end: string): string[] {
  const values: string[] = []
  const cursor = new Date(`${start}T00:00:00.000Z`)
  const last = new Date(`${end}T00:00:00.000Z`)
  while (cursor <= last) {
    values.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return values
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** Reject invalid or conflicting remote dates before they can affect salary. */
export function isChinaHolidayDataset(value: unknown): value is ChinaHolidayDataset {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.version !== 'string'
    || !/^\d{4}\.[1-9]\d{0,5}$/.test(value.version) || !isObject(value.years) || !Object.keys(value.years).length) return false
  return Object.entries(value.years).every(([year, definition]) => {
    if (!/^\d{4}$/.test(year) || !isObject(definition) || typeof definition.sourceUrl !== 'string') return false
    try {
      const url = new URL(definition.sourceUrl)
      if (url.protocol !== 'https:' || !(url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))) return false
    } catch { return false }
    const validDate = (date: unknown): date is string => {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${year}-`)) return false
      const parsed = new Date(`${date}T00:00:00.000Z`)
      return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date
    }
    if (!Array.isArray(definition.holidays) || !definition.holidays.length
      || !Array.isArray(definition.statutoryDates) || !definition.statutoryDates.length
      || !Array.isArray(definition.adjustedWorkdays)) return false
    const days = new Set<string>()
    for (const period of definition.holidays) {
      if (!isObject(period) || !isName(period.name) || !validDate(period.start) || !validDate(period.end) || period.start > period.end) return false
      for (const date of dateRange(period.start, period.end)) {
        if (days.has(date)) return false
        days.add(date)
      }
    }
    if (new Set(definition.statutoryDates).size !== definition.statutoryDates.length
      || !definition.statutoryDates.every(date => validDate(date) && days.has(date))) return false
    for (const workday of definition.adjustedWorkdays) {
      if (!isObject(workday) || !isName(workday.name) || !validDate(workday.date) || days.has(workday.date)) return false
      days.add(workday.date)
    }
    return true
  })
}

function compareVersions(left: string, right: string): number {
  const [leftYear, leftRevision] = left.split('.').map(Number)
  const [rightYear, rightRevision] = right.split('.').map(Number)
  return leftYear - rightYear || leftRevision - rightRevision
}

function includesYears(candidate: ChinaHolidayDataset, current: ChinaHolidayDataset): boolean {
  return Object.keys(current.years).every(year => Object.hasOwn(candidate.years, year))
}

function buildHolidayDays(data: ChinaHolidayDataset): Map<string, ChinaHolidayDay> {
  const days = new Map<string, ChinaHolidayDay>()
  for (const definition of Object.values(data.years)) {
    const statutoryDates = new Set(definition.statutoryDates)
    for (const period of definition.holidays) {
      for (const date of dateRange(period.start, period.end)) {
        days.set(date, { date, name: period.name, kind: 'holiday', statutory: statutoryDates.has(date) })
      }
    }
    for (const workday of definition.adjustedWorkdays) days.set(workday.date, { ...workday, kind: 'adjusted-workday' })
  }
  return days
}

// Salary calculations look up many dates. Rebuild the index only when the saved
// data changes, including changes from another tab or a backup import.
let savedRaw: string | null = null
let activeData: ChinaHolidayDataset = bundled
let holidayDays = buildHolidayDays(activeData)

export function getChinaHolidayData(): ChinaHolidayDataset {
  let raw: string | null = null
  try { raw = localStorage.getItem(CHINA_HOLIDAY_DATA_KEY) } catch { /* Offline baseline also works without storage. */ }
  if (raw !== savedRaw) {
    let candidate: unknown
    try { candidate = raw ? JSON.parse(raw) : null } catch { candidate = null }
    activeData = isChinaHolidayDataset(candidate) && compareVersions(candidate.version, bundled.version) > 0 && includesYears(candidate, bundled)
      ? candidate : bundled
    holidayDays = buildHolidayDays(activeData)
    savedRaw = raw
  }
  return activeData
}

export function getChinaHolidayDay(date: string): ChinaHolidayDay | undefined {
  getChinaHolidayData()
  return holidayDays.get(date)
}

export function hasChinaHolidayYear(year: number): boolean {
  return Object.hasOwn(getChinaHolidayData().years, year)
}

export async function updateChinaHolidays(): Promise<'updated' | 'current' | 'older'> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let candidate: unknown
  try {
    const response = await fetch(CHINA_HOLIDAY_DATA_URL, { cache: 'no-store', credentials: 'omit', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    candidate = await response.json()
  } catch {
    throw new Error('暂时无法更新官方节假日数据，请检查网络后重试。现有数据仍可使用。')
  } finally {
    clearTimeout(timeout)
  }
  if (!isChinaHolidayDataset(candidate)) throw new Error('节假日数据格式不正确，已保留本机数据，请稍后重试。')
  // Read again after the request: another tab may already have installed a newer version.
  const current = getChinaHolidayData()
  const comparison = compareVersions(candidate.version, current.version)
  if (comparison <= 0) return comparison === 0 ? 'current' : 'older'
  if (!includesYears(candidate, current)) throw new Error('节假日数据缺少年份，已保留本机数据，请稍后重试。')
  if (!saveJSON(CHINA_HOLIDAY_DATA_KEY, candidate)) throw new Error('节假日数据无法保存，请释放设备存储空间后重试。')
  return 'updated'
}
