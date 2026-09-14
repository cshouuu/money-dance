import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, isEmployedOn, workProfileForDate, type SalaryProfile, type WorkStage } from '@salary-flow/core'
import { loadProfile, saveDatedProfile, salaryProfileForBusinessDate, withDatedWorkSettings, withSettingsStage } from './profile'
import { saveChinaHolidaySettings } from './attendance'
import { getSummaryRange, summarizeLedger } from './ledger'
import { keys, loadJSON, saveJSON } from './storage'
import { commitJourney, deleteWorkStage, profileSnapshot, undoWorkStageDeletion } from './workJourney'
import { calculatePaidTimeEarnings } from './paidTime'
import { getMonthlyWorkStats } from './monthlyStats'
import { loadTimerPlans, TIMER_PLANS_KEY } from './timerPlans'

const now = new Date(2026, 8, 30, 23)
let data: Map<string, string>
const base: SalaryProfile = { ...DEFAULT_PROFILE, salary: 4000, salaryEffectiveDate: '2026-08-01', salaryHistoryMode: 'custom' }
const stage: WorkStage = { id: 'job', name: '测试工作', company: '', role: '', startDate: '2026-08-01', endDate: null, createdAt: now.toISOString(), profile: profileSnapshot(base) }
const monthIncome = (profile: SalaryProfile, month: string) => {
  const { start, end } = getSummaryRange('month', month)
  return summarizeLedger(profile, [], start, end, now, [], []).income
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) })
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('navigator', {})
  saveJSON(keys.profile, base)
  saveChinaHolidaySettings({ enabled: false, effectiveFrom: '2026-01-01', dataVersion: '' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('dated salary and attendance settings', () => {
  it.each([false, true])('previews a narrowed salary history exactly as the saved monthly total, journey=%s', journey => {
    saveJSON(keys.profile, journey ? { ...base, workJourney: { version: 1, revision: 1, stages: [stage] } } : base)
    vi.setSystemTime(new Date(2026, 8, 14, 14, 30))
    const before = loadProfile()
    const original = structuredClone(before)
    const draft = { ...before, salary: 5000, salaryEffectiveDate: '2026-09-14', salaryHistoryMode: 'none' as const }
    const preview = withSettingsStage(withDatedWorkSettings(before, draft, '2026-09-14'))
    expect(before).toEqual(original)
    const predicted = getMonthlyWorkStats(preview, [], [], [], new Date()).income
    expect(predicted).toBeCloseTo(4.5 / 8 * 5000 / 22)
    const saved = saveDatedProfile(before, draft, '2026-09-14')!
    expect(getMonthlyWorkStats(saved, [], [], [], new Date()).income).toBeCloseTo(predicted)
    expect(salaryProfileForBusinessDate(saved, '2026-09-11').salary).toBe(4000)
  })
  it.each([false, true])('keeps accumulated monthly income when a legacy non-backfilled salary is changed, journey=%s', journey => {
    const legacy = { ...base, salaryHistoryMode: 'none' as const, salaryEffectiveDate: '2026-09-01' }
    saveJSON(keys.profile, journey ? { ...legacy, workJourney: { version: 1, revision: 1, stages: [{ ...stage, startDate: '2026-09-01', profile: profileSnapshot(legacy) }] } } : legacy)
    const editTime = new Date(2026, 8, 14, 14, 30)
    vi.setSystemTime(editTime)
    const before = loadProfile()
    const beforeStats = getMonthlyWorkStats(before, [], [], [], editTime)
    const previousDays = 9 * 4000 / 22
    const currentDayFraction = 4.5 / 8
    expect(beforeStats.income).toBeCloseTo(previousDays + currentDayFraction * 4000 / 22)

    // Saving the default settings form changes the legacy mode to custom,
    // but its original automatic salary start date must remain unchanged.
    const saved = saveDatedProfile(before, { ...before, salary: 5000, salaryHistoryMode: 'custom' }, '2026-09-14')!
    expect(saved.salaryEffectiveDate).toBe('2026-09-01')
    const afterStats = getMonthlyWorkStats(loadProfile(), [], [], [], editTime)
    expect(afterStats.income).toBeCloseTo(previousDays + currentDayFraction * 5000 / 22)
    expect(afterStats.workedSeconds).toBe(beforeStats.workedSeconds)
    expect(afterStats.progress).toBe(beforeStats.progress)
    expect(salaryProfileForBusinessDate(saved, '2026-09-11').salary).toBe(4000)

    // Editing again on a later day must not move the start or rewrite the
    // first raise; all three salary periods contribute to this month's total.
    const nextDay = new Date(2026, 8, 15, 14, 30)
    vi.setSystemTime(nextDay)
    const reloaded = loadProfile()
    expect(saveDatedProfile(reloaded, { ...reloaded, salary: 6000 }, '2026-09-15')).not.toBeNull()
    const repeated = loadProfile()
    expect(repeated.salaryEffectiveDate).toBe('2026-09-01')
    expect(getMonthlyWorkStats(repeated, [], [], [], nextDay).income).toBeCloseTo(previousDays + 5000 / 22 + currentDayFraction * 6000 / 22)
    expect(salaryProfileForBusinessDate(repeated, '2026-09-14').salary).toBe(5000)
  })
  it('keeps the first-use date when a salary saved without backfill is edited on a later day', () => {
    data.delete(keys.profile)
    vi.setSystemTime(new Date(2026, 8, 1, 8))
    const first = loadProfile()
    expect(saveDatedProfile(first, { ...first, salary: 4000 }, '2026-09-01')).not.toBeNull()
    vi.setSystemTime(new Date(2026, 8, 14, 14, 30))
    const before = loadProfile()
    expect(before.salaryHistoryMode).toBe('none')
    expect(before.salaryEffectiveDate).toBe('2026-09-01')
    expect(saveDatedProfile(before, { ...before, salary: 5000, salaryHistoryMode: 'custom' }, '2026-09-14')).not.toBeNull()
    expect(loadProfile().salaryEffectiveDate).toBe('2026-09-01')
    expect(getMonthlyWorkStats(loadProfile(), [], [], [], new Date()).income).toBeCloseTo(9 * 4000 / 22 + 4.5 / 8 * 5000 / 22)
  })
  it.each([false, true])('corrects a job salary across its existing dates without restarting monthly income, dated raises=%s', datedRaises => {
    const legacy = { ...base, salaryHistoryMode: 'none' as const, salaryEffectiveDate: '2026-09-01' }
    const job = { ...stage, startDate: '2026-09-01', profile: profileSnapshot(legacy) }
    saveJSON(keys.profile, { ...legacy, workJourney: { version: 1, revision: 1, stages: [job] } })
    vi.setSystemTime(new Date(2026, 8, 14, 14, 30))
    if (datedRaises) {
      const initial = loadProfile()
      expect(saveDatedProfile(initial, { ...initial, salary: 4500 }, '2026-09-07')).not.toBeNull()
    }
    const before = loadProfile()
    const oldStats = getMonthlyWorkStats(before, [], [], [], new Date())
    const corrected = { ...before.workJourney!.stages[0]!, profile: { ...job.profile, salary: 5000 } }
    return commitJourney(before, [corrected]).then(error => {
      expect(error).toBeNull()
      const saved = loadProfile()
      expect(saved.salaryEffectiveDate).toBe('2026-09-01')
      expect(saved.workJourney!.stages[0]!.startDate).toBe('2026-09-01')
      expect(salaryProfileForBusinessDate(saved, '2026-09-01').salary).toBe(5000)
      const stats = getMonthlyWorkStats(saved, [], [], [], new Date())
      expect(stats.income).toBeCloseTo((9 + 4.5 / 8) * 5000 / 22)
      expect(stats.workedSeconds).toBe(oldStats.workedSeconds)
      expect(stats.progress).toBe(oldStats.progress)
      expect(saved.workSettingsHistory ?? []).toEqual([])
    })
  })
  it('keeps dated salary and monthly income when only job details are edited', async () => {
    saveJSON(keys.profile, { ...base, workJourney: { version: 1, revision: 1, stages: [stage] } })
    const before = loadProfile()
    expect(saveDatedProfile(before, { ...before, salary: 5000 }, '2026-09-16')).not.toBeNull()
    const raised = loadProfile()
    const income = getMonthlyWorkStats(raised, [], [], [], now).income
    const renamed = { ...raised.workJourney!.stages[0]!, name: '改名后的工作', company: '新公司名称', role: '新岗位名称' }
    expect(await commitJourney(raised, [renamed])).toBeNull()
    const saved = loadProfile()
    expect(saved.salaryEffectiveDate).toBe('2026-08-01')
    expect(saved.workSettingsHistory).toEqual(raised.workSettingsHistory)
    expect(getMonthlyWorkStats(saved, [], [], [], now).income).toBeCloseTo(income)
  })
  it.each([false, true])('preserves previous salary in ledger and timed earnings, journey=%s', journey => {
    saveJSON(keys.profile, journey ? { ...base, workJourney: { version: 1, revision: 1, stages: [stage] } } : base)
    const before = loadProfile()
    const oldEarnings = calculatePaidTimeEarnings(before, new Date(2026, 7, 3, 9), new Date(2026, 7, 3, 18)).earnedAmount
    const saved = saveDatedProfile(before, { ...before, salary: 5000 }, '2026-09-01')!
    expect(monthIncome(saved, '2026-08')).toBeCloseTo(4000)
    expect(monthIncome(saved, '2026-09')).toBeCloseTo(5000)
    expect(calculatePaidTimeEarnings(saved, new Date(2026, 7, 3, 9), new Date(2026, 7, 3, 18)).earnedAmount).toBeCloseTo(oldEarnings)
    expect(loadProfile().salary).toBe(5000)
  })
  it('prorates a midmonth raise using each date, and rejects a stale settings tab', () => {
    const before = loadProfile()
    const saved = saveDatedProfile(before, { ...before, salary: 5000 }, '2026-09-16')!
    expect(monthIncome(saved, '2026-09')).toBeCloseTo(4500) // 11 paid days at each rate
    expect(saveDatedProfile(before, { ...before, salary: 9000 }, '2026-09-01')).toBeNull()
    expect(loadProfile().salary).toBe(5000)
  })
  it('keeps the full monthly salary when regular workdays change during the month', () => {
    const before = loadProfile()
    const next = withDatedWorkSettings(before, { ...before, workDaysPerWeek: 6 }, '2026-09-16')
    expect(monthIncome(next, '2026-08')).toBeCloseTo(4000)
    expect(monthIncome(next, '2026-09')).toBeCloseTo(4000)
  })
  it('preserves later revisions when correcting an earlier period', () => {
    let profile = withDatedWorkSettings(base, { ...base, salary: 5000 }, '2026-09-16')
    profile = withDatedWorkSettings(profile, { ...profile, salary: 4500 }, '2026-09-01')
    expect(salaryProfileForBusinessDate(profile, '2026-08-31').salary).toBe(4000)
    expect(salaryProfileForBusinessDate(profile, '2026-09-03').salary).toBe(4500)
    expect(salaryProfileForBusinessDate(profile, '2026-09-20').salary).toBe(5000)
  })
  it('does not activate a future salary early, including after reload', () => {
    const before = loadProfile()
    const next = saveDatedProfile(before, { ...before, salary: 6000 }, '2026-10-01')!
    expect(next.salary).toBe(4000)
    expect(loadProfile().salary).toBe(4000)
    expect(workProfileForDate(next, '2026-10-01').salary).toBe(6000)
  })
  it('preserves earlier income when personal living-cost deduction changes', () => {
    const before = loadProfile()
    const saved = saveDatedProfile(before, { ...before, includeLivingCost: true, monthlyLivingCost: 1000 }, '2026-09-30')!
    expect(monthIncome(saved, '2026-08')).toBeCloseTo(4000)
    expect(salaryProfileForBusinessDate(saved, '2026-09-29').includeLivingCost).toBe(false)
    expect(salaryProfileForBusinessDate(saved, '2026-09-30').monthlyLivingCost).toBe(1000)
  })
  it('carries the legacy timeline into the first job and preserves it when renaming', async () => {
    const before = loadProfile()
    saveDatedProfile(before, { ...before, salary: 5000 }, '2026-09-01')
    const legacy = loadProfile()
    const attached = { ...stage, profile: profileSnapshot(legacy) }
    expect(await commitJourney(legacy, [attached])).toBeNull()
    expect(monthIncome(loadProfile(), '2026-08')).toBeCloseTo(4000)
    expect(await commitJourney(loadProfile(), [{ ...attached, name: '新名称' }])).toBeNull()
    expect(monthIncome(loadProfile(), '2026-08')).toBeCloseTo(4000)
  })
})

describe('deleting a mistaken work stage', () => {
  const prepare = () => {
    saveJSON(keys.profile, { ...base, workJourney: { version: 1, revision: 1, stages: [stage] },
      vacations: [{ id: 'v', stageId: 'job', name: '年假', kind: 'custom', startDate: '2026-09-01', endDate: '2026-09-02', payMode: 'normal', value: 1 }] })
    saveJSON(keys.ledger, [{ id: 'bonus', workStageId: 'job', kind: 'manual', direction: 'income', amount: 100, occurredAt: now.toISOString(), source: '奖金', category: '收入' }])
    return loadProfile()
  }
  it('removes stage rules, preserves raw facts and manual money, and restores them on undo', async () => {
    const before = prepare()
    saveJSON(keys.sessions, [{ id: 'raw', startTime: now.toISOString() }])
    expect(await deleteWorkStage(before, 'job')).toBeNull()
    expect(loadProfile().workJourney?.stages).toEqual([])
    expect(isEmployedOn(loadProfile(), '2026-09-01')).toBe(false)
    expect(monthIncome(loadProfile(), '2026-09')).toBe(0)
    expect(loadProfile().vacations).toEqual([])
    expect(loadJSON(keys.ledger, [])).toMatchObject([{ id: 'bonus', amount: 100 }])
    expect(loadJSON(keys.sessions, [])).toHaveLength(1)
    expect(await undoWorkStageDeletion()).toBeNull()
    expect(loadProfile().workJourney?.stages).toHaveLength(1)
    expect(loadJSON(keys.ledger, [])).toMatchObject([{ workStageId: 'job' }])
  })
  it('refuses undo over newer user data and refuses deletion with an active timer', async () => {
    const before = prepare()
    saveJSON(keys.activeOvertime, { startTime: now.toISOString() })
    expect(await deleteWorkStage(before, 'job')).toContain('加班')
    saveJSON(keys.activeOvertime, null)
    expect(await deleteWorkStage(before, 'job')).toBeNull()
    saveJSON(keys.ledger, [{ id: 'new-money', amount: 200 }])
    expect(await undoWorkStageDeletion()).toContain('新改动')
    expect(loadJSON(keys.ledger, [])).toEqual([{ id: 'new-money', amount: 200 }])
  })
  it('rolls back associated data if profile persistence fails', async () => {
    const before = prepare()
    const original = localStorage.setItem
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === keys.profile && JSON.parse(value).workJourney.stages.length === 0) throw new Error('quota')
      original(key, value)
    })
    expect(await deleteWorkStage(before, 'job')).toContain('未完成')
    expect(loadProfile().workJourney?.stages).toHaveLength(1)
    expect(loadJSON(keys.ledger, [])).toMatchObject([{ workStageId: 'job' }])
  })
  it('cancels only deleted-stage appointments and does not reactivate expired appointments on undo', async () => {
    const before = prepare()
    const future = { id:'p',kind:'slacking',payMode:'unpaid',status:'scheduled',startTime:new Date(+now+3600000).toISOString() }
    saveJSON(TIMER_PLANS_KEY,[future])
    expect(await deleteWorkStage(before,'job')).toBeNull()
    expect(loadTimerPlans()[0].status).toBe('cancelled')
    vi.setSystemTime(new Date(+now+7200000))
    expect(await undoWorkStageDeletion()).toBeNull()
    expect(loadProfile().workJourney?.stages).toHaveLength(1)
    expect(loadTimerPlans()[0].status).toBe('cancelled')
    expect(loadTimerPlans()[0].message).toContain('过期')
  })
})
