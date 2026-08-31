export type ChinaHolidayDayKind = 'holiday' | 'adjusted-workday'

export interface ChinaHolidayDay {
  date: string
  name: string
  kind: ChinaHolidayDayKind
  /** True only for the statutory paid date, not every day in a long break. */
  statutory?: boolean
}

interface HolidayPeriod {
  name: string
  start: string
  end: string
}

interface HolidayYearDefinition {
  holidays: HolidayPeriod[]
  statutoryDates: string[]
  adjustedWorkdays: { date: string; name: string }[]
}

/**
 * Versioned, audited baseline from the State Council holiday notices.
 *
 * Sources:
 * - 2025 (国办发明电〔2024〕12号):
 *   https://www.scio.gov.cn/live/2025/35455/wjzc/202501/t20250123_883280.html
 * - 2026 (国办发明电〔2025〕7号):
 *   https://www.scio.gov.cn/zdgz/jj/202511/t20251110_938367.html
 *
 * This data only describes rest days and adjusted workdays. It deliberately
 * does not encode statutory overtime multipliers or create pay records.
 */
export const CHINA_HOLIDAY_DATA_VERSION = '2026.1'

const DEFINITIONS: Record<number, HolidayYearDefinition> = {
  2025: {
    holidays: [
      { name: '元旦', start: '2025-01-01', end: '2025-01-01' },
      { name: '春节', start: '2025-01-28', end: '2025-02-04' },
      { name: '清明', start: '2025-04-04', end: '2025-04-06' },
      { name: '劳动节', start: '2025-05-01', end: '2025-05-05' },
      { name: '端午', start: '2025-05-31', end: '2025-06-02' },
      { name: '国庆·中秋', start: '2025-10-01', end: '2025-10-08' },
    ],
    statutoryDates: [
      '2025-01-01',
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
      '2025-04-04',
      '2025-05-01', '2025-05-02',
      '2025-05-31',
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06',
    ],
    adjustedWorkdays: [
      { date: '2025-01-26', name: '春节' },
      { date: '2025-02-08', name: '春节' },
      { date: '2025-04-27', name: '劳动节' },
      { date: '2025-09-28', name: '国庆·中秋' },
      { date: '2025-10-11', name: '国庆·中秋' },
    ],
  },
  2026: {
    holidays: [
      { name: '元旦', start: '2026-01-01', end: '2026-01-03' },
      { name: '春节', start: '2026-02-15', end: '2026-02-23' },
      { name: '清明', start: '2026-04-04', end: '2026-04-06' },
      { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
      { name: '端午', start: '2026-06-19', end: '2026-06-21' },
      { name: '中秋', start: '2026-09-25', end: '2026-09-27' },
      { name: '国庆', start: '2026-10-01', end: '2026-10-07' },
    ],
    statutoryDates: [
      '2026-01-01',
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
      '2026-04-05',
      '2026-05-01', '2026-05-02',
      '2026-06-19',
      '2026-09-25',
      '2026-10-01', '2026-10-02', '2026-10-03',
    ],
    adjustedWorkdays: [
      { date: '2026-01-04', name: '元旦' },
      { date: '2026-02-14', name: '春节' },
      { date: '2026-02-28', name: '春节' },
      { date: '2026-05-09', name: '劳动节' },
      { date: '2026-09-20', name: '国庆' },
      { date: '2026-10-10', name: '国庆' },
    ],
  },
}

export const SUPPORTED_CHINA_HOLIDAY_YEARS = Object.freeze(
  Object.keys(DEFINITIONS).map(Number).sort((a, b) => a - b),
)

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

function buildHolidayDays(): Map<string, ChinaHolidayDay> {
  const days = new Map<string, ChinaHolidayDay>()
  for (const definition of Object.values(DEFINITIONS)) {
    const statutoryDates = new Set(definition.statutoryDates)
    for (const period of definition.holidays) {
      for (const date of dateRange(period.start, period.end)) {
        days.set(date, { date, name: period.name, kind: 'holiday', statutory: statutoryDates.has(date) })
      }
    }
    for (const workday of definition.adjustedWorkdays) {
      days.set(workday.date, { ...workday, kind: 'adjusted-workday' })
    }
  }
  return days
}

const HOLIDAY_DAY_BY_DATE = buildHolidayDays()

export function getChinaHolidayDay(date: string): ChinaHolidayDay | undefined {
  return HOLIDAY_DAY_BY_DATE.get(date)
}

export function hasChinaHolidayYear(year: number): boolean {
  return Object.hasOwn(DEFINITIONS, year)
}
