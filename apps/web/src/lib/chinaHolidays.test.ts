import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bundled from './chinaHolidays.data.json'
import { CHINA_HOLIDAY_DATA_KEY, CHINA_HOLIDAY_DATA_URL, CHINA_HOLIDAY_DATA_VERSION, getChinaHolidayData, getChinaHolidayDay, hasChinaHolidayYear, isChinaHolidayDataset, SUPPORTED_CHINA_HOLIDAY_YEARS, updateChinaHolidays, type ChinaHolidayDataset } from './chinaHolidays'

let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
  getChinaHolidayData()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('China mainland holiday baseline', () => {
  it('ships an explicit version and a bounded set of audited years', () => {
    expect(CHINA_HOLIDAY_DATA_VERSION).toBe(bundled.version)
    expect(isChinaHolidayDataset(bundled)).toBe(true)
    expect(SUPPORTED_CHINA_HOLIDAY_YEARS).toEqual(Object.keys(bundled.years).map(Number))
    expect(hasChinaHolidayYear(2026)).toBe(true)
    expect(hasChinaHolidayYear(2027)).toBe(true)
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
    expect(getChinaHolidayDay('2099-01-01')).toBeUndefined()
    expect(getChinaHolidayDay('2026-08-31')).toBeUndefined()
  })

  it('matches all 2027 breaks and makeup workdays in the State Council notice', () => {
    const breaks = [['01-01', '01-03'], ['02-05', '02-13'], ['04-03', '04-05'], ['05-01', '05-05'], ['06-09', '06-09'], ['09-15', '09-15'], ['10-01', '10-07']]
    const expectedRestDates = breaks.flatMap(([start, end]) => {
      const days: string[] = []
      for (let day = Number(start.slice(-2)); day <= Number(end.slice(-2)); day++) days.push(`2027-${start.slice(0, 3)}${String(day).padStart(2, '0')}`)
      return days
    })
    const observed: string[] = []
    for (let day = new Date('2027-01-01T00:00:00Z'); day.getUTCFullYear() === 2027; day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10)
      if (getChinaHolidayDay(date)?.kind === 'holiday') observed.push(date)
    }
    expect(observed).toEqual(expectedRestDates)
    expect(bundled.years[2027].adjustedWorkdays.map(day => day.date)).toEqual(['2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09'])
    for (const day of bundled.years[2027].adjustedWorkdays) expect(getChinaHolidayDay(day.date)?.kind).toBe('adjusted-workday')
    expect(observed.filter(date => getChinaHolidayDay(date)?.statutory)).toEqual([
      '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-04-05',
      '2027-05-01', '2027-05-02', '2027-06-09', '2027-09-15', '2027-10-01', '2027-10-02', '2027-10-03',
    ])
  })
})

// Synthetic future data tests the protocol, not an actual official arrangement.
function futureData(): ChinaHolidayDataset {
  const data: ChinaHolidayDataset = structuredClone(bundled)
  data.version = '2098.1'
  data.years['2098'] = {
    sourceUrl: 'https://www.gov.cn/test-notice',
    holidays: [{ name: '测试元旦', start: '2098-01-01', end: '2098-01-03' }],
    statutoryDates: ['2098-01-01'],
    adjustedWorkdays: [{ date: '2098-01-04', name: '测试元旦' }],
  }
  return data
}

function serve(value: unknown) {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

describe('independent official holiday updates', () => {
  it('downloads new years, persists them and reads them offline without changing user settings', async () => {
    values.set('money-dance.china-holiday-calendar.v1', JSON.stringify({ enabled: false, effectiveFrom: '2026-11-01', dataVersion: '2026.1' }))
    const settings = values.get('money-dance.china-holiday-calendar.v1')
    const fetcher = serve(futureData())
    expect(await updateChinaHolidays()).toBe('updated')
    expect(fetcher).toHaveBeenCalledWith(CHINA_HOLIDAY_DATA_URL, expect.objectContaining({ cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal) }))
    const saved = values.get(CHINA_HOLIDAY_DATA_KEY)!
    values.delete(CHINA_HOLIDAY_DATA_KEY)
    expect(hasChinaHolidayYear(2098)).toBe(false)
    values.set(CHINA_HOLIDAY_DATA_KEY, saved)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(getChinaHolidayDay('2098-01-01')).toMatchObject({ name: '测试元旦', statutory: true })
    expect(getChinaHolidayDay('2098-01-03')?.statutory).toBe(false)
    expect(getChinaHolidayDay('2098-01-04')?.kind).toBe('adjusted-workday')
    expect(values.get('money-dance.china-holiday-calendar.v1')).toBe(settings)
  })

  it('reports equal versions without writing and never downgrades a newer saved version', async () => {
    serve(bundled)
    expect(await updateChinaHolidays()).toBe('current')
    expect(values.has(CHINA_HOLIDAY_DATA_KEY)).toBe(false)
    values.set(CHINA_HOLIDAY_DATA_KEY, JSON.stringify(futureData()))
    serve(bundled)
    expect(await updateChinaHolidays()).toBe('older')
    expect(getChinaHolidayData().version).toBe('2098.1')
  })

  it('compares revision numbers numerically', async () => {
    const current = futureData()
    current.version = '2098.2'
    values.set(CHINA_HOLIDAY_DATA_KEY, JSON.stringify(current))
    serve({ ...current, version: '2098.10' })
    expect(await updateChinaHolidays()).toBe('updated')
    expect(getChinaHolidayData().version).toBe('2098.10')
  })

  it.each([
    ['unsupported schema', (data: ChinaHolidayDataset) => { data.schemaVersion = 2 }],
    ['invalid date', (data: ChinaHolidayDataset) => { data.years['2098'].holidays[0].end = '2098-02-30' }],
    ['another year', (data: ChinaHolidayDataset) => { data.years['2098'].holidays[0].end = '2099-01-03' }],
    ['overlapping breaks', (data: ChinaHolidayDataset) => { data.years['2098'].holidays.push({ ...data.years['2098'].holidays[0] }) }],
    ['workday conflict', (data: ChinaHolidayDataset) => { data.years['2098'].adjustedWorkdays[0].date = '2098-01-01' }],
    ['duplicate workday', (data: ChinaHolidayDataset) => { data.years['2098'].adjustedWorkdays.push({ ...data.years['2098'].adjustedWorkdays[0] }) }],
    ['statutory date outside break', (data: ChinaHolidayDataset) => { data.years['2098'].statutoryDates = ['2098-01-10'] }],
    ['unsafe source link', (data: ChinaHolidayDataset) => { data.years['2098'].sourceUrl = 'javascript:alert(1)' }],
    ['missing earlier year', (data: ChinaHolidayDataset) => { delete data.years['2025'] }],
  ])('rejects %s without replacing existing data', async (_name, change) => {
    const data = futureData()
    change(data)
    serve(data)
    await expect(updateChinaHolidays()).rejects.toThrow('已保留本机数据')
    expect(values.has(CHINA_HOLIDAY_DATA_KEY)).toBe(false)
    expect(getChinaHolidayData().version).toBe(bundled.version)
  })

  it('keeps local data on network, HTTP and JSON failures', async () => {
    values.set(CHINA_HOLIDAY_DATA_KEY, JSON.stringify(futureData()))
    for (const response of [Promise.reject(new Error('offline')), Promise.resolve(new Response('unavailable', { status: 503 })), Promise.resolve(new Response('<html>'))]) {
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(response))
      await expect(updateChinaHolidays()).rejects.toThrow('请检查网络')
      expect(getChinaHolidayData().version).toBe('2098.1')
    }
  })

  it('times out a stalled request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
    const assertion = expect(updateChinaHolidays()).rejects.toThrow('请检查网络')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(values.has(CHINA_HOLIDAY_DATA_KEY)).toBe(false)
  })

  it('does not activate data if durable storage fails', async () => {
    serve(futureData())
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    await expect(updateChinaHolidays()).rejects.toThrow('无法保存')
    expect(hasChinaHolidayYear(2098)).toBe(false)
  })

  it('falls back to the bundled data when the saved cache is corrupt or obsolete', () => {
    for (const raw of ['{', JSON.stringify({ ...bundled, version: '2025.1' }), JSON.stringify({ schemaVersion: 1 })]) {
      values.set(CHINA_HOLIDAY_DATA_KEY, raw)
      expect(getChinaHolidayData().version).toBe(bundled.version)
      expect(getChinaHolidayDay('2027-02-05')?.statutory).toBe(true)
    }
  })

  it('does not overwrite an update completed by another tab during the request', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
    const pending = updateChinaHolidays()
    values.set(CHINA_HOLIDAY_DATA_KEY, JSON.stringify({ ...futureData(), version: '2098.2' }))
    resolve(new Response(JSON.stringify(futureData())))
    expect(await pending).toBe('older')
    expect(getChinaHolidayData().version).toBe('2098.2')
  })
})
