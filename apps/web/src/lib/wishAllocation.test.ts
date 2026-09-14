import { DEFAULT_PROFILE } from '@salary-flow/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WishItem } from '../types'
import { calculatePaidTimeEarnings } from './paidTime'
import { createWishAllocationPlan, evaluateWishAllocation, getQueuedWishProgress, latestWishItems, projectWishAllocation, reviseWishAllocationPlan } from './wishAllocation'
import { commitWishChange, loadWishStore } from './wishStore'
import { keys } from './storage'
import { replaceScheduledWorkTime } from './work'
import { buildWishWidgetSnapshot } from './wishWidget'

const profile = { ...DEFAULT_PROFILE, salaryType: 'daily' as const, salary: 80, paidBreak: false }
const at = (time: string, day = '2026-08-03') => new Date(`${day}T${time}:00`)
const item = (id: string, price = 100, start = at('09:00')): WishItem => ({ id, name: id, price, createdAt: start.toISOString(), startedAt: start.toISOString() })
const planFor = (...items: WishItem[]) => createWishAllocationPlan([...items].reverse(), at('09:00'))
let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
})

describe('shared wish income', () => {
  it('allocates one income across three same-day wishes and carries overflow', () => {
    const state = evaluateWishAllocation(planFor(item('A', 20), item('B'), item('C')), profile, at('14:00'))
    expect(state.amounts).toEqual({ A: 20, B: 20 })
    expect(state.income).toBe(40)
    expect(Object.values(state.amounts).reduce((a, b) => a + b, 0) + state.available + state.spent).toBeCloseTo(state.income)
  })

  it('retains prior allocations after prioritizing a different wish, including reloads', () => {
    const plan = planFor(item('A'), item('B'))
    const next = reviseWishAllocationPlan(plan, [...plan.initial].reverse(), at('10:00'))
    const state = evaluateWishAllocation(next, profile, at('12:00'))
    expect(state.amounts).toEqual({ A: 10, B: 20 })
    expect(evaluateWishAllocation(JSON.parse(JSON.stringify(next)), profile, at('12:00'))).toEqual(state)
  })

  it('corrects historical wages using the order that was effective at each time', () => {
    const plan = planFor(item('A'), item('B'))
    const next = reviseWishAllocationPlan(plan, [...plan.initial].reverse(), at('10:00'))
    expect(evaluateWishAllocation(next, { ...profile, salary: 160 }, at('12:00')).amounts).toEqual({ A: 20, B: 40 })
  })

  it('releases deleted allocations once, without restarting the income clock', () => {
    const plan = planFor(item('A'), item('B'))
    const next = reviseWishAllocationPlan(plan, [plan.initial[1]], at('10:00'))
    const state = evaluateWishAllocation(next, profile, at('12:00'))
    expect(state.amounts).toEqual({ B: 30 })
    expect(state.income).toBe(30)
  })

  it('reserves completed wishes until bought and never recycles purchased money', () => {
    const plan = planFor(item('A', 20), item('B'))
    const next = reviseWishAllocationPlan(plan, plan.initial.map(wish => wish.id === 'A' ? { ...wish, purchasedAt: at('14:00').toISOString() } : wish), at('14:00'))
    const state = evaluateWishAllocation(next, profile, at('15:00'))
    expect(state.amounts).toEqual({ B: 30 })
    expect(state.spent).toBe(20)
    expect(state.available).toBe(0)
    expect(state.income).toBe(50)
  })

  it('covers an early purchase shortfall before funding the next wish', () => {
    const plan = planFor(item('A', 40), item('B'))
    const next = reviseWishAllocationPlan(plan, plan.initial.map(wish => wish.id === 'A' ? { ...wish, purchasedAt: at('10:00').toISOString() } : wish), at('10:00'))
    expect(evaluateWishAllocation(next, profile, at('12:00')).available).toBe(-10)
    const state = evaluateWishAllocation(next, profile, at('15:00'))
    expect(state.amounts.B).toBe(10)
    expect(state.available + state.spent + state.amounts.B).toBe(state.income)
  })

  it('releases only the excess after a price decrease and preserves funding after an increase', () => {
    const plan = planFor(item('A'), item('B'))
    const cheaper = reviseWishAllocationPlan(plan, [item('A', 5), item('B')], at('10:00'))
    expect(evaluateWishAllocation(cheaper, profile, at('10:00')).amounts).toEqual({ A: 5, B: 5 })
    const larger = reviseWishAllocationPlan(cheaper, [item('A', 50), item('B')], at('11:00'))
    expect(evaluateWishAllocation(larger, profile, at('12:00')).amounts).toEqual({ A: 15, B: 15 })
  })

  it('adds a new wish at the tail without replaying old income into it', () => {
    const plan = planFor(item('A'))
    const added = reviseWishAllocationPlan(plan, [item('A'), item('B')], at('14:00'))
    expect(evaluateWishAllocation(added, profile, at('15:00')).amounts).toEqual({ A: 50 })
  })

  it('keeps unused income for later wishes after the last wish is removed', () => {
    const plan = planFor(item('A'))
    const empty = reviseWishAllocationPlan(plan, [], at('10:00'))
    const added = reviseWishAllocationPlan(empty, [item('B', 100, at('14:00'))], at('14:00'))
    expect(evaluateWishAllocation(added, profile, at('14:00')).amounts).toEqual({ B: 40 })
  })

  it('does not count earnings before the first future start, including forecasts', () => {
    const future = item('A', 40, at('09:00', '2026-08-04'))
    const result = getQueuedWishProgress(planFor(future), profile, at('14:00'))
    expect(result.allocation.income).toBe(0)
    expect(result.progress.get('A')?.progress).toBe(0)
    expect(result.progress.get('A')?.estimatedAt).toEqual(at('14:00', '2026-08-04'))
  })

  it('skips a future wish until its start and retains earlier allocations in other wishes', () => {
    const plan = planFor(item('A', 100, at('13:00')), item('B'))
    // Explicit initial order models a future wish moved ahead of an active one.
    plan.initial = [item('A', 100, at('13:00')), item('B')]
    expect(evaluateWishAllocation(plan, profile, at('14:00')).amounts).toEqual({ B: 30, A: 10 })
  })

  it('starts free future wishes on their selected date, not when income is next earned', () => {
    const plan = planFor(item('A', 0, at('00:00', '2026-08-08')))
    expect(getQueuedWishProgress(plan, profile, at('14:00')).progress.get('A')?.estimatedAt).toEqual(at('00:00', '2026-08-08'))
  })
  it('needs zero more work for a free wish even when the current wage is zero', () => {
    const result = getQueuedWishProgress(planFor(item('free', 0)), { ...profile, salary: 0 }, at('10:00'))
    expect(result.progress.get('free')?.remainingSeconds).toBe(0)
    expect(result.progress.get('free')?.requiredSeconds).toBe(0)
    expect(result.progress.get('free')?.progress).toBe(1)
  })

  it('includes preceding goals in the expected completion time', () => {
    const result = getQueuedWishProgress(planFor(item('A', 40), item('B', 40)), profile, at('10:00'))
    expect(result.progress.get('A')?.estimatedAt).toEqual(at('14:00'))
    expect(result.progress.get('B')?.estimatedAt).toEqual(at('18:00'))
    expect(result.progress.get('B')?.state).toBe('waiting')
  })

  it('preserves lunch, weekends and corrected fixed working times', () => {
    const records = [replaceScheduledWorkTime('2026-08-03', '09:00', '12:00')]
    const plan = planFor(item('A', 20), item('B', 100))
    const result = getQueuedWishProgress(plan, profile, at('14:00'), records)
    expect(result.allocation.income).toBe(30)
    expect(result.progress.get('B')?.estimatedAt).toEqual(at('10:00', '2026-08-05'))
  })

  it('migrates historical purchases by subtracting their actual target once', () => {
    const plan = planFor({ ...item('A', 20), purchasedAt: at('11:00').toISOString() }, item('B', 100))
    const state = evaluateWishAllocation(plan, profile, at('14:00'))
    expect(state.spent).toBe(20)
    expect(state.amounts.B).toBe(20)
    expect(state.income).toBe(40)
  })

  it('projects per-wish native slices even when earlier queue items are not displayed', () => {
    const plan = planFor(item('A', 20), item('B', 40), item('C', 100))
    const state = evaluateWishAllocation(plan, profile, at('10:00'))
    const projected = projectWishAllocation(state, profile, [], [], { native: true, until: at('18:00').getTime() })
    for (const clock of ['11:00', '12:30', '14:00', '18:00']) {
      const time = at(clock).getTime()
      const actual = evaluateWishAllocation(plan, profile, at(clock))
      for (const id of ['A', 'B', 'C']) {
        const amount = (state.amounts[id] ?? 0) + projected.allocations.filter(slice => slice.wishId === id).reduce((sum, slice) => sum + (slice.amount !== undefined ? time >= slice.startAt ? slice.amount : 0 : Math.max(0, Math.min(time, slice.endAt) - slice.startAt) / 1000 * slice.ratePerSecond), 0)
        expect(amount).toBeCloseTo(actual.amounts[id] ?? 0)
      }
    }
    expect(state.income).toBe(calculatePaidTimeEarnings(profile, at('09:00'), at('10:00')).earnedAmount)
  })
  it('sends only selected native slots while allocating against the full queue', () => {
    const plan = planFor(item('A', 20), item('B', 40), item('C', 100))
    const snapshot = buildWishWidgetSnapshot(profile, plan.initial, ['C'], [], [], at('10:00'), plan)
    expect(snapshot.allocationMode).toBe('sequential')
    expect(snapshot.wishes.map(wish => wish.id)).toEqual(['C'])
    expect(snapshot.timeline).toEqual([])
    expect(snapshot.allocationTimeline[0].startAt).toBe(at('16:00').getTime())
    expect(snapshot.allocationTimeline.every(slice => slice.wishId === 'C')).toBe(true)
  })
  it('projects held funds as one grant at a future participation date', () => {
    const plan = planFor(item('A', 10), item('B', 100, at('13:00')))
    const state = evaluateWishAllocation(plan, profile, at('12:00'))
    expect(state.available).toBe(20)
    const projection = projectWishAllocation(state, profile, [], [], { native: true, until: at('14:00').getTime() })
    expect(projection.allocations.find(slice => slice.amount !== undefined)).toEqual({ wishId: 'B', startAt: at('13:00').getTime(), endAt: at('13:00').getTime(), ratePerSecond: 0, amount: 20 })
    expect(evaluateWishAllocation(plan, profile, at('14:00')).amounts.B).toBe(30)
  })
})

describe('wish changes and purchase storage', () => {
  const seed = async () => {
    expect(await commitWishChange(loadWishStore(), { type: 'save', item: item('A') }, at('09:00'))).toBeNull()
  }
  it('requires review before converting existing independent progress', async () => {
    data.set(keys.wishes, JSON.stringify([item('B'), item('A')]))
    const old = loadWishStore()
    expect(await commitWishChange(old, { type: 'prioritize', id: 'A' }, at('10:00'))).toContain('预览')
    expect(await commitWishChange(old, { type: 'adopt' }, at('10:00'))).toBeNull()
    expect(loadWishStore().items.map(wish => wish.id)).toEqual(['A', 'B'])
    expect(loadWishStore().plan?.initial).toHaveLength(2)
  })
  it('writes one purchase expense and rejects duplicate submissions', async () => {
    await seed()
    const before = loadWishStore()
    expect(await commitWishChange(before, { type: 'purchase', id: 'A' }, at('10:00'))).toBeNull()
    expect(await commitWishChange(before, { type: 'purchase', id: 'A' }, at('10:00'))).toContain('其他页面')
    expect(JSON.parse(data.get(keys.ledger)!)).toHaveLength(1)
    expect(latestWishItems(loadWishStore().plan!)[0].purchasedAt).toBe(at('10:00').toISOString())
  })
  it('keeps legacy editing and purchases available without silently adopting the queue', async () => {
    data.set(keys.wishes, JSON.stringify([item('A')]))
    expect(await commitWishChange(loadWishStore(), { type: 'save', item: item('A', 30) }, at('10:00'))).toBeNull()
    expect(loadWishStore().plan).toBeNull()
    expect(await commitWishChange(loadWishStore(), { type: 'purchase', id: 'A' }, at('11:00'))).toBeNull()
    expect(loadWishStore().plan).toBeNull()
    expect(JSON.parse(data.get(keys.ledger)!)[0].amount).toBe(30)
  })
  it('shows a just-saved order before the next minute tick', () => {
    const plan = planFor(item('A'), item('B'))
    const revised = reviseWishAllocationPlan(plan, [...plan.initial].reverse(), at('10:01'))
    const result = getQueuedWishProgress(revised, profile, at('10:00'))
    expect(result.progress.get('B')?.state).toBe('saving')
    expect(result.progress.get('A')?.earnedAmount).toBeCloseTo(10 + 1 / 6)
  })
  it('rolls back both wish keys if the ledger cannot be saved', async () => {
    await seed()
    const before = loadWishStore()
    const setItem = localStorage.setItem
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === keys.ledger) throw new Error('full'); setItem(key, value) })
    expect(await commitWishChange(before, { type: 'purchase', id: 'A' }, at('10:00'))).toContain('未完成')
    expect(loadWishStore()).toEqual(before)
    expect(data.has(keys.ledger)).toBe(false)
  })
  it('rolls back a migration if its compatibility list cannot be saved', async () => {
    data.set(keys.wishes, JSON.stringify([item('B'), item('A')]))
    const before = loadWishStore()
    const setItem = localStorage.setItem
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === keys.wishes) throw new Error('full'); setItem(key, value) })
    expect(await commitWishChange(before, { type: 'adopt' }, at('10:00'))).toContain('未完成')
    expect(loadWishStore()).toEqual(before)
    expect(data.has(keys.wishAllocation)).toBe(false)
  })
  it('rejects a stale edit rather than resurrecting a deleted wish', async () => {
    await seed()
    const before = loadWishStore()
    expect(await commitWishChange(before, { type: 'delete', id: 'A' }, at('10:00'))).toBeNull()
    expect(await commitWishChange(before, { type: 'save', item: { ...item('A'), price: 50 } }, at('11:00'))).toContain('其他页面')
    expect(loadWishStore().items).toEqual([])
  })
})
