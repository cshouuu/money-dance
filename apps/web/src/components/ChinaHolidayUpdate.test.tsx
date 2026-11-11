// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { domAnimation, LazyMotion } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { ChinaHolidayUpdate } from './ChinaHolidayUpdate'
import { AttendanceCalendar } from './AttendanceCalendar'
import { useChinaHolidaySettings } from '../lib/useChinaHolidays'
import { CHINA_HOLIDAY_SETTINGS_KEY, loadChinaHolidaySettings } from '../lib/attendance'
import { CHINA_HOLIDAY_DATA_KEY } from '../lib/chinaHolidays'
import bundled from '../lib/chinaHolidays.data.json'

let root: Root
function Calendar() {
  const settings = useChinaHolidaySettings()
  return <><ChinaHolidayUpdate/><AttendanceCalendar profile={DEFAULT_PROFILE} records={[]} workRecords={[]} holidaySettings={settings} dimension="day" anchor="2027-06-01" onChange={() => {}} onSelectDate={() => {}}/></>
}
function button() { return document.querySelector<HTMLButtonElement>('.china-holiday-update button')! }
const dateLabel = () => document.querySelector('[aria-label^="2027-06-10，"]')?.getAttribute('aria-label')

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem(CHINA_HOLIDAY_SETTINGS_KEY, JSON.stringify({ enabled: true, effectiveFrom: '2025-01-01', dataVersion: bundled.version }))
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<LazyMotion features={domAnimation}><Calendar/></LazyMotion>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('manual official holiday update', () => {
  it('shows included years and refreshes the calendar immediately after saving', async () => {
    expect(document.body.textContent).toContain('已收录 2025、2026、2027 年')
    expect(dateLabel()).not.toContain('测试调整')
    const data = structuredClone(bundled)
    data.version = '2098.1'
    data.years[2027].holidays.push({ name: '测试调整', start: '2027-06-10', end: '2027-06-10' })
    let resolve!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal('fetch', fetcher)
    await act(async () => { button().click(); button().click() })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(button().disabled).toBe(true)
    expect(button().textContent).toContain('正在更新')
    await act(async () => resolve(new Response(JSON.stringify(data))))
    expect(button().disabled).toBe(false)
    expect(document.querySelector('[role="status"]')?.textContent).toContain('已保存到本机')
    expect(document.body.textContent).toContain('数据版本 2098.1')
    expect(dateLabel()).toContain('测试调整·休')
    expect(loadChinaHolidaySettings()).toEqual({ enabled: true, effectiveFrom: '2025-01-01', dataVersion: '2098.1' })
  })

  it('reports a network error and allows retry without changing the calendar', async () => {
    const label = dateLabel()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response(JSON.stringify(bundled)))
    vi.stubGlobal('fetch', fetcher)
    await act(async () => button().click())
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('请检查网络')
    expect(dateLabel()).toBe(label)
    expect(localStorage.getItem(CHINA_HOLIDAY_DATA_KEY)).toBeNull()
    await act(async () => button().click())
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('最新收录数据')
  })

  it('refreshes another tab after an independent data change', async () => {
    const data = structuredClone(bundled)
    data.version = '2098.2'
    data.years[2027].holidays.push({ name: '跨页测试', start: '2027-06-10', end: '2027-06-10' })
    await act(async () => {
      localStorage.setItem(CHINA_HOLIDAY_DATA_KEY, JSON.stringify(data))
      window.dispatchEvent(new StorageEvent('storage', { key: CHINA_HOLIDAY_DATA_KEY }))
    })
    expect(dateLabel()).toContain('跨页测试·休')
    expect(document.body.textContent).toContain('数据版本 2098.2')
  })
})
