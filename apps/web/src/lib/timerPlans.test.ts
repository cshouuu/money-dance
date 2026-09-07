import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { cancelTimerPlan, loadTimerPlans, reconcileTimerPlans, saveTimerPlan, validateTimerPlan, type TimerPlan } from './timerPlans'
import { keys, loadJSON } from './storage'
import { createCompletedOvertimeSession } from './overtime'
import { createWebTimerSessionId } from './timerStop'
import type { OvertimeSession, SlackingSession } from '../types'

let data: Map<string, string>
const at = (hour: number, minute = 0) => new Date(2026, 8, 7, hour, minute)
const plan = (id: string, kind: TimerPlan['kind'] = 'overtime', start = 18, end: number | undefined = 20): TimerPlan => ({ id, kind, startTime: at(start).toISOString(), endTime: end === undefined ? undefined : at(end).toISOString(), status: 'scheduled', payMode: 'multiplier', multiplier: 2 })
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } })
  data.set(keys.profile, JSON.stringify({ ...DEFAULT_PROFILE, salaryType: 'daily', salary: 80, monthlyRateBasis: 'average', salaryEffectiveDate: '2026-01-01' }))
})
afterEach(() => vi.unstubAllGlobals())

describe('timer reservations', () => {
  it('allows multiple future plans and rejects overlap only within the same kind', () => {
    const first = plan('one')
    expect(saveTimerPlan(first, at(10))).toBeNull()
    expect(saveTimerPlan(plan('two', 'overtime', 20, 21), at(10))).toBeNull()
    expect(saveTimerPlan(plan('overlap', 'overtime', 19, 21), at(10))).toContain('重叠')
    expect(saveTimerPlan(plan('fish', 'slacking', 19, 21), at(10))).toBeNull()
    expect(loadTimerPlans()).toHaveLength(3)
    expect(validateTimerPlan(first, [], at(19))).toContain('未来')
  })
  it('starts exactly from the planned time, stops at the planned end and never duplicates income', () => {
    saveTimerPlan(plan('one'), at(10))
    expect(reconcileTimerPlans(at(17)).changed).toBe(false)
    expect(reconcileTimerPlans(at(18, 30)).error).toBeNull()
    expect(loadJSON<any>(keys.activeOvertime, null).startTime).toBe(at(18).toISOString())
    expect(loadTimerPlans()[0].status).toBe('running')
    expect(reconcileTimerPlans(at(21)).error).toBeNull()
    expect(loadJSON(keys.activeOvertime, null)).toBeNull()
    const sessions = loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])
    expect(sessions).toHaveLength(1)
    expect(sessions[0].endTime).toBe(at(20).toISOString())
    expect(sessions[0].earnedAmount).toBeCloseTo(40)
    expect(loadJSON<any[]>(keys.ledger, [])).toHaveLength(1)
    expect(reconcileTimerPlans(at(22)).changed).toBe(false)
    expect(loadJSON<any[]>(keys.ledger, [])).toHaveLength(1)
  })
  it('backfills multiple elapsed reservations chronologically after reopening', () => {
    saveTimerPlan(plan('one', 'overtime', 18, 19), at(10))
    saveTimerPlan(plan('two', 'overtime', 19, 20), at(10))
    expect(reconcileTimerPlans(at(22)).error).toBeNull()
    expect(loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])).toHaveLength(2)
    expect(loadTimerPlans().every(item => item.status === 'completed')).toBe(true)
  })
  it('pauses a conflicting reservation instead of replacing a manual timer', () => {
    saveTimerPlan(plan('one'), at(10))
    const manual = { startTime: at(17).toISOString(), payMode: 'unpaid' }
    data.set(keys.activeOvertime, JSON.stringify(manual))
    reconcileTimerPlans(at(19))
    expect(loadTimerPlans()[0].status).toBe('conflict')
    expect(loadJSON(keys.activeOvertime, null)).toEqual(manual)
    expect(saveTimerPlan({ ...plan('one'), startTime: at(21).toISOString(), endTime: at(22).toISOString() }, at(19))).toBeNull()
  })
  it('allows later plans after an open-ended reservation but conflicts at runtime', () => {
    const open = { ...plan('one'), endTime: undefined }
    saveTimerPlan(open, at(10))
    expect(saveTimerPlan(plan('two', 'overtime', 21, 22), at(10))).toBeNull()
    reconcileTimerPlans(at(23))
    expect(loadTimerPlans().find(item => item.id === 'two')?.status).toBe('conflict')
    expect(loadTimerPlans().find(item => item.id === 'one')?.status).toBe('running')
  })
  it('recognizes early manual completion without restarting or duplicating', () => {
    const item = plan('one')
    saveTimerPlan(item, at(10)); reconcileTimerPlans(at(18))
    const session = createCompletedOvertimeSession({ ...item, id: createWebTimerSessionId('overtime', item.startTime)!, endTime: at(19).toISOString() }, 80 / 28800)!
    data.set(keys.overtimeSessions, JSON.stringify([session])); data.delete(keys.activeOvertime)
    reconcileTimerPlans(at(20))
    expect(loadTimerPlans()[0].status).toBe('completed')
    expect(loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])).toHaveLength(1)
  })
  it('deducts scheduled unpaid rest from a completed slacking reservation', () => {
    saveTimerPlan(plan('fish', 'slacking', 11, 14), at(10))
    reconcileTimerPlans(at(15))
    const session = loadJSON<SlackingSession[]>(keys.sessions, [])[0]
    expect(session.durationSeconds).toBe(10800)
    expect(session.paidDurationSeconds).toBe(7200)
    expect(session.earnedAmount).toBeCloseTo(20)
  })
  it('supports edits and cancellation without executing cancelled plans', () => {
    saveTimerPlan(plan('one'), at(10))
    expect(saveTimerPlan({ ...plan('one'), endTime: at(21).toISOString() }, at(11))).toBeNull()
    expect(loadTimerPlans()).toHaveLength(1)
    expect(cancelTimerPlan('one')).toBe(true)
    reconcileTimerPlans(at(22))
    expect(loadJSON(keys.activeOvertime, null)).toBeNull()
    expect(loadJSON(keys.overtimeSessions, [])).toEqual([])
  })
  it('rolls back a failed completion and retries without duplicate records or income', () => {
    saveTimerPlan(plan('one'), at(10))
    const original = localStorage.setItem
    let failed = false
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === keys.ledger && !failed) { failed = true; throw new Error('full') }; original(key, value) })
    expect(reconcileTimerPlans(at(22)).error).not.toBeNull()
    expect(loadTimerPlans()[0].status).toBe('scheduled')
    expect(loadJSON(keys.overtimeSessions, []) ?? []).toEqual([])
    expect(reconcileTimerPlans(at(22)).error).toBeNull()
    expect(loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])).toHaveLength(1)
    expect(loadJSON<any[]>(keys.ledger, [])).toHaveLength(1)
  })
  it('supports fixed and unpaid overnight reservations without changing total pay', () => {
    const overnight = { ...plan('night'), startTime: at(23).toISOString(), endTime: new Date(2026, 8, 8, 1).toISOString(), payMode: 'fixed' as const, fixedAmount: 100 }
    expect(saveTimerPlan(overnight, at(10))).toBeNull()
    expect(reconcileTimerPlans(new Date(2026, 8, 8, 2)).error).toBeNull()
    const result = loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])[0]
    expect(result.durationSeconds).toBe(7200)
    expect(result.earnedAmount).toBe(100)
    expect(result.startLocalDate).toBe('2026-09-07')
  })
  it('can backfill a past plan without stopping a newer non-overlapping active timer', () => {
    saveTimerPlan(plan('past', 'overtime', 18, 19), at(10))
    const active = { startTime: at(21).toISOString(), payMode: 'unpaid' }
    data.set(keys.activeOvertime, JSON.stringify(active))
    reconcileTimerPlans(at(22))
    expect(loadTimerPlans()[0].status).toBe('completed')
    expect(loadJSON(keys.activeOvertime, null)).toEqual(active)
  })

  it('does not adopt a manually started timer sharing the exact reservation start', () => {
    const item = plan('same')
    saveTimerPlan(item, at(10))
    const active = { startTime: item.startTime, payMode: 'fixed', fixedAmount: 15 }
    data.set(keys.activeOvertime, JSON.stringify(active))
    reconcileTimerPlans(at(19))
    expect(loadTimerPlans()[0].status).toBe('conflict')
    expect(loadJSON(keys.activeOvertime, null)).toEqual(active)
  })

})
