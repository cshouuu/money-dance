import { DEFAULT_PROFILE, type SalaryProfile, type WorkStage } from '@salary-flow/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, DailyWorkRecord } from '../types'
import { AttendanceCalendar } from './AttendanceCalendar'

const fixed: SalaryProfile = { ...DEFAULT_PROFILE, workWeekMode: 'fixed', workDaysPerWeek: 5 }
const alternating: SalaryProfile = { ...fixed, workWeekMode: 'alternating', alternatingAnchorDate: '2026-10-05', alternatingAnchorType: 'big' }
const holidays = { enabled: true, effectiveFrom: '2026-01-01', dataVersion: 'test' }

function calendar(profile = fixed, options: {
  records?: AttendanceRecord[]; workRecords?: DailyWorkRecord[]; official?: boolean;
  anchor?: string; dimension?: 'day' | 'month'; effectiveFrom?: string;
} = {}) {
  return renderToStaticMarkup(<AttendanceCalendar profile={profile} records={options.records ?? []}
    workRecords={options.workRecords ?? []} holidaySettings={{ ...holidays, enabled: options.official ?? false, effectiveFrom: options.effectiveFrom ?? holidays.effectiveFrom }}
    dimension={options.dimension ?? 'day'} anchor={options.anchor ?? '2026-10-01'} onChange={() => {}} onSelectDate={() => {}} />)
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 10, 12)) })
afterEach(() => vi.useRealTimers())

describe('attendance calendar workweek labels', () => {
  it('shows upcoming fixed-week rest days while ordinary workdays remain pending', () => {
    const html = calendar()
    expect(html).toContain('aria-label="2026-10-17，休息"')
    expect(html).toContain('aria-label="2026-10-18，休息"')
    expect(html).toContain('aria-label="2026-10-19，未到"')
  })

  it('uses the configured number of working days instead of assuming double weekends', () => {
    expect(calendar({ ...fixed, workDaysPerWeek: 6 })).toContain('aria-label="2026-10-17，未到"')
    expect(calendar({ ...fixed, workDaysPerWeek: 6 })).toContain('aria-label="2026-10-18，休息"')
    expect(calendar({ ...fixed, workDaysPerWeek: 7 })).toContain('aria-label="2026-10-18，未到"')
    expect(calendar({ ...fixed, workDaysPerWeek: 4 })).toContain('aria-label="2026-10-16，休息"')
  })

  it('distinguishes big-week Saturdays, small-week Saturdays and Sundays in advance', () => {
    const html = calendar(alternating)
    expect(html).toContain('aria-label="2026-10-17，小周·休"')
    expect(html).toContain('aria-label="2026-10-24，大周·班"')
    expect(html).toContain('aria-label="2026-10-18，休息"')
    expect(calendar({ ...alternating, alternatingAnchorType: 'small' })).toContain('aria-label="2026-10-17，大周·班"')
  })

  it('carries alternating-week parity across years even without an official calendar', () => {
    const html = calendar({ ...alternating, alternatingAnchorDate: '2026-12-28' }, { anchor: '2027-01-01' })
    expect(html).toContain('aria-label="2027-01-02，大周·班"')
    expect(html).toContain('aria-label="2027-01-09，小周·休"')
    expect(html).toContain('aria-label="2027-01-03，休息"')
  })

  it('preserves official holidays and makeup workdays above the personal workweek', () => {
    const html = calendar(fixed, { official: true })
    expect(html).toContain('aria-label="2026-10-01，国庆·休，中国大陆节假日日历"')
    expect(html).toContain('aria-label="2026-10-10，国庆·班，中国大陆节假日日历"')
    expect(html).toContain('aria-label="2026-10-17，休息"')
    expect(calendar(fixed, { official: true, effectiveFrom: '2026-10-11' })).toContain('aria-label="2026-10-10，休息"')
  })

  it('keeps manual attendance and recorded work above automatic rest labels', () => {
    const records: AttendanceRecord[] = [{ date: '2026-10-17', status: 'normal', updatedAt: '' }]
    const workRecords: DailyWorkRecord[] = [{ date: '2026-10-18', mode: 'scheduled', status: 'ended', sessions: [], updatedAt: '' }]
    const html = calendar(alternating, { records, workRecords })
    expect(html).toContain('aria-label="2026-10-17，正常，已调整"')
    expect(html).toContain('aria-label="2026-10-18，正常"')
  })

  it('uses each work stage schedule and keeps career gaps marked as not employed', () => {
    const first: WorkStage = { id: 'first', name: 'first', company: '', role: '', startDate: '2026-10-01', endDate: '2026-10-18', createdAt: '', profile: fixed }
    const second: WorkStage = { ...first, id: 'second', startDate: '2026-10-21', endDate: null, profile: alternating }
    const html = calendar({ ...fixed, workJourney: { version: 1, revision: 1, stages: [second, first] } })
    expect(html).toContain('aria-label="2026-10-17，休息"')
    expect(html).toContain('aria-label="2026-10-20，未任职"')
    expect(html).toContain('aria-label="2026-10-24，大周·班"')
    expect(html).toContain('aria-label="2026-10-31，小周·休"')
  })

  it('does not count future planned workdays as completed attendance', () => {
    expect(calendar(alternating, { dimension: 'month', official: true })).toContain('aria-label="10月，正常0天，请假0天，放假0天"')
  })
})
