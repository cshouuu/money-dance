import { describe, it, expect } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { buildDesktopSnapshot } from './desktopSnapshot'
import { summarizeTodayWork } from './work'
import type { DailyWorkRecord } from '../types'

const profile = { ...DEFAULT_PROFILE, salary: 800, salaryType: 'daily' as const, workDaysPerWeek: 5 }
describe('desktop salary companion', () => {
  it('uses exactly the dashboard amount and distinguishes working, lunch and weekends', () => {
    const morning = new Date(2026, 8, 14, 10)
    const result = buildDesktopSnapshot(profile, [], [], null, null, morning)
    expect(result.workAmount).toBe(summarizeTodayWork(profile, [], morning).earnedAmount)
    expect(result.state).toBe('working')
    expect(buildDesktopSnapshot(profile, [], [], null, null, new Date(2026, 8, 14, 12, 30)).state).toBe('rest')
    expect(buildDesktopSnapshot(profile, [], [], null, null, new Date(2026, 7, 30, 10)).state).toBe('rest')
  })
  it('preserves explicit slacking and prioritizes overtime without inventing overtime pay', () => {
    const now = new Date(2026, 8, 14, 20), startTime = new Date(2026, 8, 14, 19).toISOString()
    expect(buildDesktopSnapshot(profile, [], [], { startTime }, null, now).state).toBe('slacking')
    const result = buildDesktopSnapshot(profile, [], [], { startTime }, { startTime, payMode: 'unpaid' }, now)
    expect(result.state).toBe('overtime'); expect(result.overtimeAmount).toBe(0); expect(result.overtimeSeconds).toBe(3600)
  })
  it('keeps overnight overtime duration and amount independent of the new business date', () => {
    const startTime = new Date(2026, 8, 14, 23).toISOString()
    const result = buildDesktopSnapshot(profile, [], [], null, { startTime, startLocalDate: '2026-09-14', payMode: 'fixed', fixedAmount: 200 }, new Date(2026, 8, 15, 1))
    expect(result.overtimeSeconds).toBe(7200); expect(result.overtimeAmount).toBe(200); expect(result.overtimeId).toBe(startTime)
  })
  it('planned flexible end freezes wages and changes to rest while hidden', () => {
    const record: DailyWorkRecord = { date: '2026-09-14', mode: 'flexible', status: 'working', sessions: [{ id: 'a', startTime: new Date(2026, 8, 14, 9).toISOString() }], plannedEndTime: new Date(2026, 8, 14, 10).toISOString(), updatedAt: new Date(2026, 8, 14, 9).toISOString() }
    const result = buildDesktopSnapshot(profile, [record], [], null, null, new Date(2026, 8, 14, 11))
    expect(result.state).toBe('rest')
    expect(result.workAmount).toBe(summarizeTodayWork(profile, [record], new Date(2026, 8, 14, 10)).earnedAmount)
  })
  it('ignores future and corrupted active timers', () => {
    const now = new Date(2026, 8, 14, 10)
    expect(buildDesktopSnapshot(profile, [], [], { startTime: 'bad' }, { startTime: 'bad', payMode: 'unpaid' }, now).state).toBe('working')
    expect(buildDesktopSnapshot(profile, [], [], null, { startTime: new Date(2026, 8, 15).toISOString(), payMode: 'fixed', fixedAmount: 500 }, now).overtimeAmount).toBe(0)
  })
})
