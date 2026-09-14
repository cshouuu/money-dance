import { calculateRates, priceToWorkSeconds, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, WishItem } from '../types'
import { loadChinaHolidaySettings } from './attendance'
import { toLocalDateValue } from './form'
import { actualPaidIntervalsForDate, actualPaidIntervalsInRange, plannedPaidIntervalsForDate } from './paidTime'
import { salaryProfileForBusinessDate } from './profile'
import { MAX_SHIFT_DAYS } from './roster'
import type { WishProgress } from './wishProgress'

/** Only user changes are stored. Replaying them also applies corrected wage/work
 * history without moving old allocations just because the queue was reordered. */
export interface WishAllocationPlan {
  version: 1
  adoptedAt: string
  initial: WishItem[]
  revisions: { at: string; items: WishItem[] }[]
}

export interface WishIncomeSlice { startAt: number; endAt: number; ratePerSecond: number }
export interface WishAllocationSlice extends WishIncomeSlice { wishId: string; amount?: number }
export interface WishAllocationState {
  at: number
  incomeFrom: number
  items: WishItem[]
  amounts: Record<string, number>
  available: number
  income: number
  spent: number
}

export interface QueuedWishProgress extends WishProgress {
  state: 'upcoming' | 'saving' | 'waiting' | 'funded'
  position: number
}

const EPSILON = 1e-7
const instant = (value: string) => new Date(value).getTime()
export const wishStart = (item: WishItem) => instant(item.startedAt ?? item.createdAt)
const target = (item: WishItem) => Math.max(0, Number.isFinite(item.price) ? item.price : 0)
const cloneItems = (items: readonly WishItem[]) => items.map(item => ({ ...item }))

export function createWishAllocationPlan(items: readonly WishItem[], now = new Date()): WishAllocationPlan {
  // Legacy storage lists newest first. Reverse first to preserve creation order
  // even for wishes made in the same millisecond.
  const initial = cloneItems(items).reverse().sort((a, b) => instant(a.createdAt) - instant(b.createdAt))
  return { version: 1, adoptedAt: now.toISOString(), initial, revisions: [] }
}

export function latestWishItems(plan: WishAllocationPlan): WishItem[] {
  return plan.revisions.at(-1)?.items ?? plan.initial
}

export function reviseWishAllocationPlan(plan: WishAllocationPlan, items: WishItem[], now: Date): WishAllocationPlan {
  return { ...plan, revisions: [...plan.revisions, { at: now.toISOString(), items: cloneItems(items) }] }
}

function eligible(item: WishItem, at: number): boolean {
  return !item.purchasedAt && wishStart(item) <= at
}

function distributeBalance(state: WishAllocationState, at: number, allocations?: WishAllocationSlice[]) {
  if (state.available <= EPSILON) return
  for (const item of state.items) {
    if (!eligible(item, at)) continue
    const amount = Math.min(state.available, Math.max(0, target(item) - (state.amounts[item.id] ?? 0)))
    if (amount <= EPSILON) continue
    state.amounts[item.id] = (state.amounts[item.id] ?? 0) + amount
    state.available -= amount
    allocations?.push({ wishId: item.id, startAt: at, endAt: at, ratePerSecond: 0, amount })
  }
}

function earn(state: WishAllocationState, startAt: number, endAt: number, rate: number, allocations?: WishAllocationSlice[]) {
  startAt = Math.max(startAt, state.incomeFrom)
  if (endAt <= startAt || !(rate > 0)) return
  let remaining = (endAt - startAt) / 1000 * rate
  state.income += remaining
  let cursor = startAt
  // Buying before enough has been allocated creates a visible shortfall. It is
  // covered once before any new income can be promised to another wish.
  if (state.available < 0) {
    const covered = Math.min(remaining, -state.available)
    state.available += covered
    remaining -= covered
    cursor += covered / rate * 1000
  }
  for (const item of state.items) {
    if (!eligible(item, startAt)) continue
    const amount = Math.min(remaining, Math.max(0, target(item) - (state.amounts[item.id] ?? 0)))
    if (amount <= EPSILON) continue
    const end = cursor + amount / rate * 1000
    state.amounts[item.id] = (state.amounts[item.id] ?? 0) + amount
    allocations?.push({ wishId: item.id, startAt: cursor, endAt: end, ratePerSecond: rate })
    remaining -= amount
    cursor = end
  }
  state.available += remaining
}

function applyRevision(state: WishAllocationState, next: WishItem[], at: number) {
  const previous = new Map(state.items.map(item => [item.id, item]))
  const nextById = new Map(next.map(item => [item.id, item]))
  for (const item of state.items) {
    if (item.purchasedAt) continue
    const replacement = nextById.get(item.id)
    if (!replacement || replacement.purchasedAt) {
      state.available += state.amounts[item.id] ?? 0
      delete state.amounts[item.id]
    } else {
      const excess = Math.max(0, (state.amounts[item.id] ?? 0) - target(replacement))
      state.amounts[item.id] = (state.amounts[item.id] ?? 0) - excess
      state.available += excess
    }
  }
  for (const item of next) {
    if (item.purchasedAt && !previous.get(item.id)?.purchasedAt) {
      state.spent += target(item)
      state.available -= target(item)
    }
  }
  state.items = cloneItems(next)
  distributeBalance(state, at)
}

/** Processes each time boundary once: a currency unit can reach only one wish.
 * Future starts are boundaries too, including zero-price wishes and cash held
 * while all currently eligible wishes are funded. */
export function advanceWishAllocation(
  state: WishAllocationState,
  slices: readonly WishIncomeSlice[],
  until: number,
  revisions: readonly { at: number; items: WishItem[] }[] = [],
  allocations?: WishAllocationSlice[],
): WishAllocationState {
  type Boundary = { rate: number; revisions: WishItem[][] }
  const boundaries = new Map<number, Boundary>()
  const boundary = (at: number) => {
    let value = boundaries.get(at)
    if (!value) { value = { rate: 0, revisions: [] }; boundaries.set(at, value) }
    return value
  }
  boundary(state.at)
  boundary(until)
  for (const slice of slices) {
    const start = Math.max(state.at, slice.startAt)
    const end = Math.min(until, slice.endAt)
    if (end <= start) continue
    boundary(start).rate += slice.ratePerSecond
    boundary(end).rate -= slice.ratePerSecond
  }
  for (const revision of revisions) {
    if (revision.at >= state.at && revision.at <= until) boundary(revision.at).revisions.push(revision.items)
  }
  const allItems = [...state.items, ...revisions.flatMap(revision => revision.items)]
  for (const item of allItems) {
    const start = wishStart(item)
    if (start >= state.at && start <= until) boundary(start)
  }
  let cursor = state.at
  let rate = 0
  for (const [at, event] of [...boundaries].sort(([a], [b]) => a - b)) {
    earn(state, cursor, at, rate, allocations)
    for (const items of event.revisions) applyRevision(state, items, at)
    distributeBalance(state, at, allocations)
    rate = Math.max(0, rate + event.rate)
    cursor = at
  }
  state.at = until
  return state
}

export function evaluateWishAllocation(
  plan: WishAllocationPlan,
  profile: SalaryProfile,
  now = new Date(),
  workRecords: readonly DailyWorkRecord[] = [],
  attendanceRecords: readonly AttendanceRecord[] = [],
): WishAllocationState {
  const end = now.getTime()
  const starts = plan.initial.map(wishStart)
  for (const revision of plan.revisions) {
    if (instant(revision.at) > end) continue
    for (const item of revision.items) if (!item.purchasedAt) starts.push(Math.max(instant(revision.at), wishStart(item)))
  }
  const validStarts = starts.filter(Number.isFinite)
  const incomeFrom = validStarts.length ? Math.min(...validStarts) : end
  const originalPurchaseTimes = plan.initial.filter(item => item.purchasedAt).map(item => instant(item.purchasedAt!))
  const first = Math.min(incomeFrom, ...originalPurchaseTimes, ...plan.revisions.map(revision => instant(revision.at)), end)
  const state: WishAllocationState = {
    at: first, incomeFrom, items: plan.initial.map(item => ({ ...item, purchasedAt: undefined })),
    amounts: {}, available: 0, income: 0, spent: 0,
  }
  const revisions: { at: number; items: WishItem[] }[] = []
  let historical = cloneItems(state.items)
  for (const purchased of plan.initial.filter(item => item.purchasedAt).sort((a, b) => instant(a.purchasedAt!) - instant(b.purchasedAt!))) {
    historical = historical.map(item => item.id === purchased.id ? { ...purchased } : item)
    revisions.push({ at: instant(purchased.purchasedAt!), items: historical })
  }
  revisions.push(...plan.revisions.map(revision => ({ at: instant(revision.at), items: revision.items })))
  revisions.sort((a, b) => a.at - b.at)
  const settings = loadChinaHolidaySettings(now)
  const rates = new Map<string, number>()
  const slices = actualPaidIntervalsInRange(profile, new Date(incomeFrom), now, workRecords, attendanceRecords, settings).map(interval => {
    let rate = rates.get(interval.businessDate)
    if (rate === undefined) {
      rate = calculateRates(salaryProfileForBusinessDate(profile, interval.businessDate, [...attendanceRecords], settings)).second
      rates.set(interval.businessDate, rate)
    }
    return { startAt: interval.start.getTime(), endAt: interval.end.getTime(), ratePerSecond: Math.max(0, rate) }
  })
  return advanceWishAllocation(state, slices, end, revisions)
}

export function copyWishAllocationState(state: WishAllocationState): WishAllocationState {
  return { ...state, items: cloneItems(state.items), amounts: { ...state.amounts } }
}

/** Shared forecast for app estimates and native widget slices. With no saved
 * actual work, app estimates use the configured future plan. Native projections
 * retain their bounded actual-timer behavior. */
export function projectWishAllocation(
  state: WishAllocationState,
  profile: SalaryProfile,
  workRecords: readonly DailyWorkRecord[],
  attendanceRecords: readonly AttendanceRecord[],
  options: { until?: number; native?: boolean } = {},
): { allocations: WishAllocationSlice[]; completion: Map<string, Date>; until: number } {
  const initialAt = state.at
  const projected = copyWishAllocationState(state)
  const now = new Date(initialAt)
  const settings = loadChinaHolidaySettings(now)
  const allocations: WishAllocationSlice[] = []
  const completion = new Map<string, Date>()
  const wishes = state.items.filter(item => !item.purchasedAt)
  const markCompleted = (at: number) => {
    for (const item of wishes) {
      if (!completion.has(item.id) && eligible(item, at) && (projected.amounts[item.id] ?? 0) + EPSILON >= target(item)) {
        completion.set(item.id, new Date(Math.max(wishStart(item), at)))
      }
    }
  }
  markCompleted(initialAt)
  const last = options.until ?? new Date(now.getFullYear() + 10, now.getMonth(), now.getDate()).getTime()
  const boundedRecords = options.native ? workRecords.map(record => record.mode !== 'flexible' ? record : {
    ...record, sessions: record.sessions.map(session => session.endTime ? session : {
      ...session, endTime: record.plannedEndTime ?? new Date(initialAt + 36 * 3600_000).toISOString(),
    }),
  }) : workRecords
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Calendar-day windows include shifts that started on an earlier business day.
  for (let count = 0; count < 3661 && date.getTime() < last && completion.size < wishes.length; count++, date.setDate(date.getDate() + 1)) {
    const windowEnd = new Date(date)
    windowEnd.setDate(windowEnd.getDate() + 1)
    const end = Math.min(last, windowEnd.getTime())
    const from = Math.max(projected.at, date.getTime())
    const slices: WishIncomeSlice[] = []
    const business = new Date(date)
    business.setDate(business.getDate() - (profile.rosters?.length ? MAX_SHIFT_DAYS : 1))
    for (; business < windowEnd; business.setDate(business.getDate() + 1)) {
      const value = toLocalDateValue(business)
      const fixed = workRecords.find(record => record.date === value && record.mode === 'scheduled')
      const intervals = options.native
        ? actualPaidIntervalsForDate(profile, value, new Date(last), boundedRecords, attendanceRecords, settings)
        : fixed
          ? actualPaidIntervalsForDate(profile, value, new Date(last), [fixed], attendanceRecords, settings)
          : plannedPaidIntervalsForDate(profile, value, attendanceRecords, settings)
      const overlapping = intervals.filter(interval => interval.end.getTime() > from && interval.start.getTime() < end)
      if (!overlapping.length) continue
      const rate = calculateRates(salaryProfileForBusinessDate(profile, value, [...attendanceRecords], settings)).second
      for (const interval of overlapping) slices.push({ startAt: Math.max(from, interval.start.getTime()), endAt: Math.min(end, interval.end.getTime()), ratePerSecond: Math.max(0, rate) })
    }
    const firstAllocation = allocations.length
    advanceWishAllocation(projected, slices, end, [], allocations)
    for (const allocation of allocations.slice(firstAllocation)) {
      const item = wishes.find(item => item.id === allocation.wishId)!
      if ((projected.amounts[item.id] ?? 0) + EPSILON >= target(item) && !completion.has(item.id)) {
        // The last allocation in this window is when this wish reaches its price.
        const lastAllocation = [...allocations].reverse().find(slice => slice.wishId === item.id)!
        completion.set(item.id, new Date(Math.ceil(lastAllocation.endAt)))
      }
    }
    markCompleted(end)
    // Free future wishes complete at their start even without a paid interval.
    for (const item of wishes) if (target(item) === 0 && wishStart(item) <= end) completion.set(item.id, new Date(Math.max(initialAt, wishStart(item))))
  }
  return { allocations, completion, until: last }
}

export function getQueuedWishProgress(
  plan: WishAllocationPlan, profile: SalaryProfile, now = new Date(),
  workRecords: readonly DailyWorkRecord[] = [], attendanceRecords: readonly AttendanceRecord[] = [],
) {
  // Components tick once a minute. A just-saved revision must be visible
  // immediately even when that tick predates the completed user action.
  now = new Date(Math.max(now.getTime(), instant(plan.revisions.at(-1)?.at ?? plan.adoptedAt)))
  const allocation = evaluateWishAllocation(plan, profile, now, workRecords, attendanceRecords)
  const forecast = projectWishAllocation(allocation, profile, workRecords, attendanceRecords)
  const rates = calculateRates(salaryProfileForBusinessDate(profile, toLocalDateValue(now), [...attendanceRecords]))
  const items = allocation.items.filter(item => !item.purchasedAt)
  const current = items.find(item => eligible(item, now.getTime()) && (allocation.amounts[item.id] ?? 0) + EPSILON < target(item))
  const progress = new Map<string, QueuedWishProgress>(items.map((item, index) => {
    const price = target(item)
    const earnedAmount = Math.min(price, Math.max(0, allocation.amounts[item.id] ?? 0))
    const upcomingStart = wishStart(item) > now.getTime() ? new Date(wishStart(item)) : null
    const remainingAmount = Math.max(0, price - earnedAmount)
    const requiredSeconds = price > 0 ? priceToWorkSeconds(price, rates.second) : 0
    return [item.id, {
      upcomingStart, earnedAmount, remainingAmount, requiredSeconds,
      progress: price > 0 ? earnedAmount / price : upcomingStart ? 0 : 1,
      remainingSeconds: remainingAmount > EPSILON ? priceToWorkSeconds(remainingAmount, rates.second) : 0,
      requiredWorkDays: price === 0 ? 0 : rates.paidSecondsPerDay > 0 ? requiredSeconds / rates.paidSecondsPerDay : Infinity,
      estimatedAt: forecast.completion.get(item.id) ?? null,
      position: index + 1,
      state: upcomingStart ? 'upcoming' : remainingAmount <= EPSILON ? 'funded' : item.id === current?.id ? 'saving' : 'waiting',
    }]
  }))
  return { allocation, progress }
}
