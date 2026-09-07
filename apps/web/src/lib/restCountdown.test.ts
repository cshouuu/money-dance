import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { countdownClock, getRestCountdown } from './restCountdown'
import type { TodayWorkSummary } from './work'
import type { DailyWorkRecord } from '../types'
const settings = { enabled: false, effectiveFrom: '2026-01-01', dataVersion: '' }
const profile = { ...DEFAULT_PROFILE, workDaysPerWeek: 5 }
const work: TodayWorkSummary = { mode: 'scheduled', status: 'working', dayType: 'work', businessDate: '2026-09-10', workedSeconds: 0, earnedAmount: 0 }
const at = (time: string) => new Date(`2026-09-10T${time}:00`)
const get = (time: string, override = work) => getRestCountdown(profile, override, at(time), [], [], settings)
describe('rest countdowns', () => {
  it('moves from lunch countdown to lunch break and then end of work', () => {
    expect(get('11:28').featured.label).toBe('距离午休')
    expect(countdownClock(get('11:28').featured.target!, at('11:28'))).toBe('00 : 32 : 00')
    expect(get('12:00').featured.label).toBe('午休中')
    expect(get('13:00').featured.label).toBe('距离下班')
    expect(get('18:00').featured.target).toBeNull()
    expect(get('18:00').endLabel).toBe('已下班')
  })
  it('does not invent an end for flexible work and uses its planned end when set', () => {
    const flexible = { ...work, mode: 'flexible' as const }
    expect(get('11:28', flexible).end).toBeNull()
    const record: DailyWorkRecord = { date: work.businessDate, mode: 'flexible', status: 'working', sessions: [], updatedAt: at('11:00').toISOString(), plannedEndTime: at('16:00').toISOString() }
    expect(get('11:28', { ...flexible, record }).end).toEqual(at('16:00'))
    expect(get('11:28', { ...flexible, status: 'ended', record }).end).toBeNull()
    const paused = { ...record, status: 'paused' as const, sessions: [{ id: 'pause', startTime: at('09:00').toISOString(), endTime: at('11:00').toISOString() }] }
    expect(get('11:28', { ...flexible, status: 'paused', record: paused }).end).toEqual(at('16:00'))
  })
  it('finds weekends and respects manual weekend work', () => {
    expect(get('11:28').rest?.days).toBe(2)
    const value = getRestCountdown(profile, work, at('11:28'), [{ date: '2026-09-12', status: 'normal', updatedAt: at('11:28').toISOString() }], [], settings)
    expect(value.rest?.days).toBe(3)
  })
  it('uses the available holiday calendar and does not invent dates when disabled', () => {
    expect(get('11:28').holiday).toBeNull()
    const value = getRestCountdown(profile, work, at('11:28'), [], [], { ...settings, enabled: true })
    expect(value.holiday).toEqual({ days: 15, hint: '中秋' })
  })
  it('keeps overnight shift end on the next date', () => {
    const night = { ...profile, workStartTime: '22:00', workEndTime: '07:00', breakStartTime: '02:00', breakEndTime: '03:00' }
    const value = getRestCountdown(night, work, at('23:00'), [], [], settings)
    expect(value.end).toEqual(new Date('2026-09-11T07:00:00'))
    expect(value.featured.target).toEqual(new Date('2026-09-11T02:00:00'))
  })
})
