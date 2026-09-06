import { DEFAULT_PROFILE, calculateRates } from '@salary-flow/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWishProgress } from './wishProgress'
import { replaceScheduledWorkTime, scheduledOverride, summarizeTodayWork } from './work'
import { calculatePaidTimeEarnings } from './paidTime'
import { summarizeLedger } from './ledger'
import { buildWishWidgetSnapshot, selectWidgetWishes } from './wishWidget'

const profile = { ...DEFAULT_PROFILE, salaryType: 'daily' as const, salary: 80, paidBreak: false }
const date = '2026-08-29'
const at = (clock: string) => new Date(date + 'T' + clock + ':00')
const wish = { id: 'one', name: '耳机', price: 160, createdAt: at('09:00').toISOString() }

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() }))

describe('user feedback regressions', () => {
  it('weekend scheduled override excludes lunch and reaches target only at shift end', () => {
    const records = [scheduledOverride(date)]
    expect(summarizeTodayWork(profile, records, at('12:30')).workedSeconds).toBe(3 * 3600)
    expect(summarizeTodayWork(profile, records, at('16:00')).workedSeconds).toBe(6 * 3600)
    expect(summarizeTodayWork(profile, records, at('18:00')).workedSeconds).toBe(8 * 3600)
  })

  it('early fixed finish freezes the same net work in dashboard, wishes and ledger', () => {
    const records = [replaceScheduledWorkTime(date, '09:00', '16:00')]
    const summary = summarizeTodayWork(profile, records, at('19:00'))
    expect(summary.status).toBe('ended')
    expect(summary.workedSeconds).toBe(6 * 3600)
    expect(summary.earnedAmount).toBeCloseTo(60)
    expect(calculatePaidTimeEarnings(profile, at('09:00'), at('19:00'), records).earnedAmount).toBeCloseTo(60)
    const ledger = summarizeLedger(profile, [], at('00:00'), new Date('2026-08-30T00:00:00'), new Date('2026-08-31T12:00:00'), records, [])
    expect(ledger.entries.find(entry => entry.category === '薪资')?.amount).toBeCloseTo(60)
  })

  it('corrects end time without turning lunch into paid time', () => {
    const record = replaceScheduledWorkTime(date, '09:00', '15:00')
    expect(summarizeTodayWork(profile, [record], at('20:00')).earnedAmount).toBe(50)
    const corrected = replaceScheduledWorkTime(date, '09:00', '17:00')
    expect(summarizeTodayWork(profile, [corrected], at('20:00')).earnedAmount).toBe(70)
  })

  it('retains explicit fixed records across midnight under their start date', () => {
    const night = { ...profile, workStartTime: '22:00', workEndTime: '07:00', breakStartTime: '02:00', breakEndTime: '03:00' }
    const record = replaceScheduledWorkTime(date, '22:00', '05:00', '2026-08-30')
    const summary = summarizeTodayWork(night, [record], new Date('2026-08-30T08:00:00'))
    expect(summary.businessDate).toBe(date)
    expect(summary.status).toBe('ended')
    expect(summary.workedSeconds).toBe(6 * 3600)
  })

  it('preserves legacy wish progress, backdates separately and recalculates after a price change', () => {
    const monday = new Date('2026-08-31T14:00:00')
    const original = { ...wish, createdAt: monday.toISOString() }
    expect(getWishProgress(original, profile, monday).earnedAmount).toBe(0)
    const backdated = { ...original, startedAt: new Date('2026-08-31T09:00:00').toISOString() }
    expect(getWishProgress(backdated, profile, monday).earnedAmount).toBe(40)
    expect(getWishProgress({ ...backdated, price: 80 }, profile, monday).progress).toBe(0.5)
    expect(getWishProgress({ ...backdated, price: 160 }, profile, monday).progress).toBe(0.25)
    expect(backdated.createdAt).toBe(original.createdAt)
  })

  it('selects up to three unique active wishes and drops purchased/deleted selections', () => {
    const items = [wish, { ...wish, id: 'two' }, { ...wish, id: 'three' }, { ...wish, id: 'four' }, { ...wish, id: 'bought', purchasedAt: at('12:00').toISOString() }]
    expect(selectWidgetWishes(items, ['one', 'one', 'deleted', 'bought', 'two', 'three', 'four']).map(item => item.id)).toEqual(['one', 'two', 'three'])
  })

  it('native hourly projections match app earnings through breaks, weekends and fixed corrections', () => {
    const records = [replaceScheduledWorkTime(date, '09:00', '16:00')]
    const snapshot = buildWishWidgetSnapshot(profile, [wish], ['one'], records, [], at('10:00'))
    for (const check of [at('12:30'), at('16:00'), at('20:00'), new Date('2026-08-31T14:00:00')]) {
      const projected = snapshot.wishes[0].earnedAmount + snapshot.timeline.reduce((total, slice) => total + Math.max(0, Math.min(check.getTime(), slice.endAt) - slice.startAt) / 1000 * slice.ratePerSecond, 0)
      expect(Math.min(wish.price, projected)).toBeCloseTo(getWishProgress(wish, profile, check, records).earnedAmount)
    }
    expect(snapshot.timeline.every(slice => slice.ratePerSecond === calculateRates(profile).second)).toBe(true)
  })
})
