import { MAX_SHIFT_DAYS } from './roster'
import { calculateRates, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, WishItem } from '../types'
import { actualPaidIntervalsForDate, calculatePaidTimeEarnings } from './paidTime'
import { loadChinaHolidaySettings } from './attendance'
import { toLocalDateValue } from './form'
import { salaryProfileForBusinessDate } from './profile'
import { evaluateWishAllocation, projectWishAllocation, type WishAllocationPlan, type WishAllocationSlice } from './wishAllocation'

export function selectWidgetWishes(items: WishItem[], ids: string[]): WishItem[] {
  return [...new Set(ids)].flatMap(id => {
    const item = items.find(wish => wish.id === id && !wish.purchasedAt)
    return item ? [item] : []
  }).slice(0, 3)
}

/** Native refreshes integrate these same paid slices without starting a WebView. */
export function buildWishWidgetSnapshot(profile: SalaryProfile, items: WishItem[], ids: string[], workRecords: DailyWorkRecord[], attendanceRecords: AttendanceRecord[], now = new Date(), plan: WishAllocationPlan | null = null) {
  const selected = selectWidgetWishes(items, ids)
  const syncedAt = now.getTime()
  const until = new Date(now)
  until.setFullYear(until.getFullYear() + 1)
  if (plan) {
    const state = evaluateWishAllocation(plan, profile, now, workRecords, attendanceRecords)
    const projected = selected.length ? projectWishAllocation(state, profile, workRecords, attendanceRecords, { until: until.getTime(), native: true }) : null
    const selectedIds = new Set(selected.map(item => item.id))
    return {
      syncedAt, validUntil: until.getTime(), allocationMode: 'sequential' as const,
      wishes: selected.map(item => ({ id: item.id, name: item.name, price: Math.max(0, item.price), earnedAmount: Math.max(0, state.amounts[item.id] ?? 0), startedAt: new Date(item.startedAt ?? item.createdAt).getTime() })),
      timeline: [] as { startAt: number; endAt: number; ratePerSecond: number }[],
      allocationTimeline: projected?.allocations.filter(slice => selectedIds.has(slice.wishId)) ?? [],
    }
  }
  const settings = loadChinaHolidaySettings(now)
  const wishes = selected.map(item => {
    const start = new Date(item.startedAt ?? item.createdAt)
    const amount = calculatePaidTimeEarnings(profile, start, now, workRecords, attendanceRecords, settings).earnedAmount
    return { id: item.id, name: item.name, price: Math.max(0, item.price), earnedAmount: Math.max(0, amount), startedAt: start.getTime() }
  })
  const timeline: { startAt: number; endAt: number; ratePerSecond: number }[] = []
  if (wishes.length) {
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (profile.rosters?.length ? MAX_SHIFT_DAYS : 1), 12)
    // An unbounded flexible timer cannot predict future days. Continue at most
    // through the existing 36-hour native horizon; reopening refreshes it.
    const boundedRecords = workRecords.map(record => record.mode !== 'flexible' ? record : {
      ...record,
      sessions: record.sessions.map(session => session.endTime ? session : {
        ...session, endTime: record.plannedEndTime ?? new Date(syncedAt + 36 * 3600_000).toISOString(),
      }),
    })
    for (; cursor <= until; cursor.setDate(cursor.getDate() + 1)) {
      const date = toLocalDateValue(cursor)
      const rate = calculateRates(salaryProfileForBusinessDate(profile, date, attendanceRecords, settings)).second
      if (!(rate > 0)) continue
      for (const interval of actualPaidIntervalsForDate(profile, date, until, boundedRecords, attendanceRecords, settings)) {
        const startAt = Math.max(syncedAt, interval.start.getTime())
        const endAt = Math.min(until.getTime(), interval.end.getTime())
        if (endAt > startAt) timeline.push({ startAt, endAt, ratePerSecond: rate })
      }
    }
  }
  return { syncedAt, validUntil: until.getTime(), allocationMode: 'independent' as const, wishes, timeline, allocationTimeline: [] as WishAllocationSlice[] }
}
