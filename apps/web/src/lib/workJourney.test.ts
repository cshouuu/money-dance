import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, calculateRates, isEmployedOn, workProfileForDate, type SalaryProfile, type WorkStage } from '@salary-flow/core'
import { commitJourney, journeyDateCount, journeyElapsedDays, journeyStageLabel, profileSnapshot, stageDays, stageSupplementalIncome, validateWorkStage } from './workJourney'
import { loadProfile, salaryProfileForBusinessDate, saveProfile, withSettingsStage } from './profile'
import { keys, loadJSON } from './storage'
import { saveChinaHolidaySettings } from './attendance'
import { getSummaryRange, summarizeLedger } from './ledger'
import { actualPaidIntervalsForDate, calculatePaidTimeEarnings } from './paidTime'
import { getScheduledBusinessDate, summarizeTodayWork } from './work'
import { getMonthlyWorkStats } from './monthlyStats'
import { loadTimerPlans, reconcileTimerPlans, saveTimerPlan, TIMER_PLANS_KEY, type TimerPlan } from './timerPlans'
import type { AttendanceRecord, LedgerEntry } from '../types'
import { applyWidgetActions } from './widgetActions'

let data: Map<string, string>
const now = new Date(2026, 8, 9, 19)
const base: SalaryProfile = { ...DEFAULT_PROFILE, salary: 80, salaryType: 'daily', monthlyRateBasis: 'average', workDaysPerWeek: 7, salaryEffectiveDate: '2026-09-01' }
const stage = (id: string, startDate: string, endDate: string | null, salary = 80): WorkStage => ({ id, name: id, company: '', role: '', startDate, endDate, createdAt: now.toISOString(), profile: profileSnapshot({ ...base, salary, salaryEffectiveDate: startDate }) })
const withStages = (...stages: WorkStage[]): SalaryProfile => ({ ...base, ...(stages.find(s => s.endDate === null)?.profile ?? {}), workJourney: { version: 1, revision: 1, stages } })
const summary = (profile: SalaryProfile, ledger: LedgerEntry[] = [], attendance: AttendanceRecord[] = []) => {
  const { start, end } = getSummaryRange('month', '2026-09')
  return summarizeLedger(profile, ledger, start, end, now, [], attendance)
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', {})
  data.set(keys.profile, JSON.stringify(base))
  saveChinaHolidaySettings({ enabled: false, effectiveFrom: '2026-01-01', dataVersion: '' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('work journey date and salary boundaries', () => {
  it('leaves legacy income intact until the user opts in', () => {
    expect(isEmployedOn(base, '1900-01-01')).toBe(true)
    expect(summary(base).income).toBe(9 * 80)
    expect(summary(withStages(stage('existing', '2026-09-01', null))).income).toBe(summary(base).income)
  })
  it('freezes old salary and schedule, excludes gaps, and resumes at new salary', () => {
    const next = stage('new', '2026-09-08', null, 160)
    next.profile = { ...next.profile!, workStartTime: '10:00', workEndTime: '14:00', breakPeriods: [] }
    const profile = withStages(stage('old', '2026-09-01', '2026-09-03'), next)
    expect(summary(profile).income).toBe(3 * 80 + 2 * 160)
    expect(calculateRates(salaryProfileForBusinessDate(profile, '2026-09-03')).daily).toBe(80)
    expect(calculateRates(salaryProfileForBusinessDate(profile, '2026-09-04')).daily).toBe(0)
    expect(workProfileForDate(profile, '2026-09-08').salary).toBe(160)
    expect(summarizeTodayWork(profile, [], new Date(2026, 8, 4, 15))).toMatchObject({ earnedAmount: 0, workedSeconds: 0, dayType: 'rest' })
    expect(actualPaidIntervalsForDate(profile, '2026-09-04', now)).toEqual([])
    expect(calculatePaidTimeEarnings(profile, new Date(2026, 8, 1), now).earnedAmount).toBe(560)
    expect(calculatePaidTimeEarnings(profile, new Date(2026, 8, 1), now).paidSeconds).toBe(32 * 3600)
  })
  it('does not infer unknown historical wages or hours from the current job', () => {
    const unknown = { ...stage('unknown', '2026-09-01', '2026-09-03'), profile: null }
    const profile = withStages(unknown, stage('new', '2026-09-08', null, 160))
    expect(stageDays(profile, unknown, now).every(day => day.amount === null && day.seconds === null)).toBe(true)
    expect(actualPaidIntervalsForDate(profile, '2026-09-01', now)).toEqual([])
    expect(summary(profile).income).toBe(320)
  })
  it('keeps partial-month monthly pay on a full-month divisor', () => {
    const old = stage('monthly', '2026-09-01', '2026-09-03')
    old.profile = { ...old.profile!, salary: 3000, salaryType: 'monthly', monthlyRateBasis: 'actual-calendar' }
    const profile = withStages(old)
    const dated = salaryProfileForBusinessDate(profile, '2026-09-02')
    expect(dated.monthlyWorkDays).toBe(30)
    expect(calculateRates(dated).daily).toBe(100)
    expect(summary(profile).income).toBe(300)
    expect(getMonthlyWorkStats(profile, [], [], [], now)).toMatchObject({ income: 300, expectedIncome: 300, plannedSeconds: 3 * 8 * 3600, workedSeconds: 3 * 8 * 3600 })
  })
  it('keeps the final overnight shift on its start date, without pre-start phantom pay', () => {
    const overnight = stage('night', '2026-09-07', '2026-09-07')
    overnight.profile = { ...overnight.profile!, workStartTime: '22:00', workEndTime: '06:00', breakPeriods: [] }
    const profile = withStages(overnight)
    expect(summarizeTodayWork(profile, [], new Date(2026, 8, 7, 2)).earnedAmount).toBe(0)
    expect(getScheduledBusinessDate(profile, new Date(2026, 8, 8, 2))).toBe('2026-09-07')
    expect(summarizeTodayWork(profile, [], new Date(2026, 8, 8, 2)).earnedAmount).toBe(40)
    const { start, end } = getSummaryRange('month', '2026-09')
    expect(summarizeLedger(profile, [], start, end, new Date(2026, 8, 8, 2), [], []).income).toBe(40)
    expect(summarizeTodayWork(profile, [], new Date(2026, 8, 8, 7)).dayType).toBe('rest')
    expect(summary(profile).income).toBe(80)
  })
  it('preserves late income and living expenses while automatic salary is stopped', () => {
    const old = stage('old', '2026-09-01', '2026-09-03')
    const profile = { ...withStages(old), includeLivingCost: true, monthlyLivingCost: 300, livingCostMode: 'daily-ledger' as const, livingCostHistory: [{ version: 1 as const, effectiveFrom: '2026-09-01', mode: 'daily-ledger' as const, monthlyAmount: 300 }] }
    const late: LedgerEntry = { id: 'bonus', kind: 'manual', direction: 'income', amount: 200, source: '补发奖金', localDate: '2026-09-08', occurredAt: new Date(2026,8,8,12).toISOString(), workStageId: old.id }
    data.set(keys.ledger, JSON.stringify([late]))
    expect(summary(profile, [late])).toMatchObject({ income: 440, expense: 90 })
    expect(stageSupplementalIncome(old.id)[0].localDate).toBe('2026-09-08')
  })
  it('does not let a gap attendance adjustment restart wage accrual', () => {
    const profile = withStages(stage('old', '2026-09-01', '2026-09-03'))
    const attendance: AttendanceRecord = { date: '2026-09-07', status: 'normal', payMode: 'fixed', fixedAmount: 999, updatedAt: now.toISOString() }
    expect(summary(profile, [], [attendance]).income).toBe(240)
  })
  it('validates inclusive overlaps, leap days, zero salary and unknown stages', () => {
    const first = stage('first', '2026-09-01', '2026-09-03')
    expect(validateWorkStage(stage('second', '2026-09-03', null), [first])).toContain('重叠')
    expect(validateWorkStage(stage('second', '2026-09-04', null, 0), [first])).toBeNull()
    expect(validateWorkStage(stage('invalid', '2026-02-29', '2026-03-01'), [])).toContain('有效')
    expect(journeyDateCount('2024-02-28', '2024-03-01')).toBe(3)
  })
})

describe('journey persistence and scheduled timers', () => {
  it('accepts semantically identical profiles even if normalization changes key order', async () => {
    const initial = loadProfile()
    const reordered = Object.fromEntries(Object.entries(initial).reverse()) as unknown as SalaryProfile
    expect(await commitJourney(reordered, [stage('current', '2026-09-01', null)])).toBeNull()
  })
  it('acknowledges stale native starts in a gap without starting a timer', () => {
    data.set(keys.profile, JSON.stringify(withStages(stage('old', '2026-09-01', '2026-09-03'))))
    expect(applyWidgetActions([{ type: 'slacking_start', actionId: 'native-gap', sessionId: 'gap', occurredAt: now.getTime(), startLocalDate: '2026-09-09' }])).toMatchObject({ success: true, changed: false, actionIds: ['native-gap'] })
    expect(loadJSON(keys.activeSlacking, null)).toBeNull()
  })
  it('archives a snapshot, survives reload, and does not rewrite history on settings save', async () => {
    const initial = loadProfile()
    const old = stage('old', '2026-09-01', '2026-09-03')
    const next = stage('new', '2026-09-08', null, 160)
    expect(await commitJourney(initial, [old, next])).toBeNull()
    expect(loadProfile().salary).toBe(160)
    expect(saveProfile({ ...loadProfile(), salary: 240 })?.salary).toBe(240)
    expect(calculateRates(salaryProfileForBusinessDate(loadProfile(), '2026-09-02')).daily).toBe(80)
    expect(loadProfile().workJourney?.stages.find(s => s.id === 'new')?.profile?.salary).toBe(240)
    expect(await commitJourney(initial, [old])).toContain('其他页面')
    expect(saveProfile(initial)).toBeNull()
  })
  it('blocks ending with an unfinished active timer', async () => {
    const initial = loadProfile()
    data.set(keys.activeSlacking, JSON.stringify({ startTime: now.toISOString() }))
    expect(await commitJourney(initial, [stage('old', '2026-09-01', '2026-09-09')])).toContain('摸鱼')
    expect(loadProfile().workJourney).toBeUndefined()
  })
  it('requires explicit plan cancellation and rolls both writes back on storage failure', async () => {
    const initial = loadProfile()
    const plan: TimerPlan = { id: 'future', kind: 'overtime', startTime: new Date(2026,8,10,19).toISOString(), status: 'scheduled', payMode: 'unpaid' }
    data.set(TIMER_PLANS_KEY, JSON.stringify([plan]))
    const stages = [stage('old', '2026-09-01', '2026-09-09')]
    expect(await commitJourney(initial, stages)).toContain('确认取消')
    const setItem = vi.spyOn(localStorage, 'setItem')
    setItem.mockImplementation((key, value) => { if (key === keys.profile && value.includes('workJourney')) throw new Error('quota'); data.set(key, value) })
    expect(await commitJourney(initial, stages, true)).toContain('保存失败')
    expect(loadTimerPlans()[0].status).toBe('scheduled')
    expect(loadJSON<SalaryProfile>(keys.profile, base).workJourney).toBeUndefined()
    setItem.mockRestore()
    expect(await commitJourney(initial, stages, true)).toBeNull()
    expect(loadTimerPlans()[0].status).toBe('cancelled')
  })
  it('rejects new gap reservations and cancels stale due plans without generating earnings', () => {
    const profile = withStages(stage('old', '2026-09-01', '2026-09-03'))
    data.set(keys.profile, JSON.stringify(profile))
    const plan: TimerPlan = { id: 'gap', kind: 'overtime', startTime: new Date(2026,8,8,19).toISOString(), endTime: new Date(2026,8,8,20).toISOString(), status: 'scheduled', payMode: 'fixed', fixedAmount: 500 }
    expect(saveTimerPlan(plan, new Date(2026,8,8,12))).toContain('工作阶段')
    data.set(TIMER_PLANS_KEY, JSON.stringify([plan]))
    expect(reconcileTimerPlans(now).error).toBeNull()
    expect(loadTimerPlans()[0].status).toBe('cancelled')
    expect(loadJSON(keys.overtimeSessions, [])).toEqual([])
  })
})


describe('planned work endings', () => {
  it('accepts future end dates while rejecting reversed or overlapping dates', () => {
    const ending = stage('current', '2026-09-01', '2026-09-20')
    expect(validateWorkStage(ending, [])).toBeNull()
    expect(validateWorkStage(stage('invalid', '2026-09-21', '2026-09-20'), [])).toContain('不能早于')
    expect(validateWorkStage(ending, [stage('next', '2026-09-20', null)])).toContain('重叠')
    expect(validateWorkStage(ending, [stage('next', '2026-09-21', null)])).toBeNull()
    expect(validateWorkStage({ ...ending, profile: null }, [])).toContain('薪资')
  })

  it('shows planned endings without counting future days as elapsed tenure', () => {
    const ending = stage('current', '2026-09-01', '2026-09-20')
    expect(journeyStageLabel(ending, '2026-09-09')).toBe('将于 2026.09.20 结束')
    expect(journeyStageLabel(ending, '2026-09-20')).toBe('今日最后任职')
    expect(journeyStageLabel(ending, '2026-09-21')).toBe('已结束')
    expect(journeyElapsedDays(ending, '2026-09-09')).toBe(9)
    expect(journeyElapsedDays(ending, '2026-09-21')).toBe(20)
    expect(journeyElapsedDays(stage('future', '2026-09-21', '2026-10-01'), '2026-09-09')).toBe(0)
  })

  it('keeps normal pay through the final day and enters rest on the next day', () => {
    const profile = withStages(stage('current', '2026-09-01', '2026-09-20'))
    expect(summary(profile).income).toBe(9 * 80)
    const finalDay = new Date(2026, 8, 20, 23, 59, 59)
    const nextDay = new Date(2026, 8, 21, 0, 0, 0)
    const before = summarizeTodayWork(profile, [], finalDay)
    const after = summarizeTodayWork(profile, [], nextDay)
    expect(isEmployedOn(profile, before.businessDate)).toBe(true)
    expect(before.earnedAmount).toBe(80)
    expect(isEmployedOn(profile, after.businessDate)).toBe(false)
    expect(after).toMatchObject({ dayType: 'rest', earnedAmount: 0 })
    expect(actualPaidIntervalsForDate(profile, '2026-09-21', nextDay)).toEqual([])
  })

  it('carries a planned final overnight shift exactly to its scheduled end', () => {
    const ending = stage('night', '2026-09-20', '2026-09-20')
    ending.profile = { ...ending.profile!, workStartTime: '22:00', workEndTime: '06:00', breakPeriods: [] }
    const profile = withStages(ending)
    const before = summarizeTodayWork(profile, [], new Date(2026, 8, 21, 5, 59, 59))
    const after = summarizeTodayWork(profile, [], new Date(2026, 8, 21, 6, 0, 0))
    expect(before.businessDate).toBe('2026-09-20')
    expect(isEmployedOn(profile, before.businessDate)).toBe(true)
    expect(after.businessDate).toBe('2026-09-21')
    expect(isEmployedOn(profile, after.businessDate)).toBe(false)
    const { start, end } = getSummaryRange('month', '2026-09')
    expect(summarizeLedger(profile, [], start, end, new Date(2026, 8, 21, 6), [], []).income).toBe(80)
  })

  it('edits the active planned-ending salary without overwriting the next job', async () => {
    const current = stage('current', '2026-09-01', '2026-09-20', 80)
    const next = stage('next', '2026-09-22', null, 160)
    expect(await commitJourney(loadProfile(), [next, current])).toBeNull()
    expect(loadProfile().salary).toBe(80)
    const draft = { ...loadProfile(), salary: 120 }
    expect(calculateRates(salaryProfileForBusinessDate(withSettingsStage(draft), '2026-09-09')).daily).toBe(120)
    expect(saveProfile(draft)).not.toBeNull()
    const saved = loadProfile()
    expect(saved.workJourney?.stages.find(s => s.id === 'current')?.profile?.salary).toBe(120)
    expect(workProfileForDate(saved, '2026-09-22').salary).toBe(160)
    // A profile already held by the homepage must also switch to the next job's rules.
    expect(summarizeTodayWork(saved, [], new Date(2026, 8, 22, 19)).earnedAmount).toBe(160)
    vi.setSystemTime(new Date(2026, 8, 22, 19))
    expect(loadProfile().salary).toBe(160)
    expect(saveProfile({ ...loadProfile(), salary: 200 })).not.toBeNull()
    expect(workProfileForDate(loadProfile(), '2026-09-20').salary).toBe(120)
  })

  it('persists an extended end date and retains reservations within the new range', async () => {
    const current = stage('current', '2026-09-01', '2026-09-20')
    expect(await commitJourney(loadProfile(), [current])).toBeNull()
    const plan: TimerPlan = { id: 'within-end', kind: 'overtime', startTime: new Date(2026, 8, 18, 19).toISOString(), status: 'scheduled', payMode: 'unpaid' }
    data.set(TIMER_PLANS_KEY, JSON.stringify([plan]))
    expect(await commitJourney(loadProfile(), [{ ...current, endDate: '2026-09-25' }])).toBeNull()
    expect(loadProfile().workJourney?.stages[0].endDate).toBe('2026-09-25')
    expect(loadTimerPlans()[0].status).toBe('scheduled')
  })
})
