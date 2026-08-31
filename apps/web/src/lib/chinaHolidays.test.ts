import { describe, expect, it } from 'vitest'
import { CHINA_HOLIDAY_DATA_VERSION, getChinaHolidayDay, hasChinaHolidayYear, SUPPORTED_CHINA_HOLIDAY_YEARS } from './chinaHolidays'

describe('China mainland holiday baseline', () => {
  it('ships an explicit version and a bounded set of audited years', () => {
    expect(CHINA_HOLIDAY_DATA_VERSION).toBe('2026.1')
    expect(SUPPORTED_CHINA_HOLIDAY_YEARS).toEqual([2025, 2026])
    expect(hasChinaHolidayYear(2026)).toBe(true)
    expect(hasChinaHolidayYear(2027)).toBe(false)
  })

  it('recognizes holiday rest days and adjusted workdays', () => {
    expect(getChinaHolidayDay('2026-02-17')).toEqual({ date: '2026-02-17', name: '春节', kind: 'holiday', statutory: true })
    expect(getChinaHolidayDay('2026-02-28')).toEqual({ date: '2026-02-28', name: '春节', kind: 'adjusted-workday' })
    expect(getChinaHolidayDay('2026-09-20')).toEqual({ date: '2026-09-20', name: '国庆', kind: 'adjusted-workday' })
    expect(getChinaHolidayDay('2026-09-25')).toEqual({ date: '2026-09-25', name: '中秋', kind: 'holiday', statutory: true })
  })

  it('keeps combined holiday names in the 2025 arrangement', () => {
    expect(getChinaHolidayDay('2025-10-06')?.name).toBe('国庆·中秋')
    expect(getChinaHolidayDay('2025-10-11')?.kind).toBe('adjusted-workday')
  })

  it('distinguishes statutory dates from transferred and weekend rest days', () => {
    expect(getChinaHolidayDay('2026-02-15')?.statutory).toBe(false)
    expect(getChinaHolidayDay('2026-02-16')?.statutory).toBe(true)
    expect(getChinaHolidayDay('2025-10-06')?.statutory).toBe(true)
    expect(getChinaHolidayDay('2025-10-07')?.statutory).toBe(false)
  })

  it('returns no opinion outside the annual dataset', () => {
    expect(getChinaHolidayDay('2027-01-01')).toBeUndefined()
    expect(getChinaHolidayDay('2026-08-31')).toBeUndefined()
  })
})
