import { buildWidgetSnapshot } from './widgetState'
import { buildWishWidgetSnapshot } from './wishWidget'
import { getWishProgress } from './wishProgress'
import { calculatePaidTimeEarnings } from './paidTime'
import { saveTimerPlan, reconcileTimerPlans } from './timerPlans'
import { DEFAULT_PROFILE, vacationForDate, type SalaryProfile, type VacationPlan, type WorkStage } from '@salary-flow/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getVacationPayAmount, resolveAttendanceDay, saveChinaHolidaySettings } from './attendance'
import { summarizeLedger } from './ledger'
import { salaryProfileForBusinessDate, loadProfile, saveProfile } from './profile'
import { getMonthlyWorkStats } from './monthlyStats'
import { actualPaidIntervalsForDate } from './paidTime'
import { getAutomaticFlexibleSettlementMode, getFlexibleBaseSettlementAmount, summarizeTodayWork } from './work'
import { getRestCountdown } from './restCountdown'
import { getPaydayCountdown } from './payday'
import { isConfiguredWorkday } from './attendance'
import { commitJourney, profileSnapshot, stageDays } from './workJourney'
import { stageVacationSummary, vacationImpact, vacationRange, validateVacation, saveVacations } from './vacations'
import { keys, loadJSON, saveJSON } from './storage'
import type { AttendanceRecord, DailyWorkRecord, SlackingSession, OvertimeSession } from '../types'

const settings = { enabled: false, effectiveFrom: '2026-01-01', dataVersion: '' }
const plan: VacationPlan = { id: 'summer', stageId: null, name: '暑假', kind: 'summer', startDate: '2026-08-01', endDate: '2026-08-31', payMode: 'normal', value: 1 }
const base: SalaryProfile = { ...DEFAULT_PROFILE, salary: 8400, monthlyRateBasis: 'average', salaryEffectiveDate: '2026-01-01', salaryHistoryMode: 'custom' }
const withPlan = (patch: Partial<VacationPlan> = {}): SalaryProfile => ({ ...base, vacations: [{ ...plan, ...patch }] })
const end = new Date(2026, 7, 31, 23)
const summary = (profile: SalaryProfile, attendance: AttendanceRecord[] = [], records: DailyWorkRecord[] = []) => summarizeLedger(profile, [], new Date(2026, 7, 1), new Date(2026, 8, 1), end, records, attendance)

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', {})
  saveChinaHolidaySettings(settings)
})

describe('vacation attendance and pay', () => {
  it.each([['normal', 1, 8400], ['ratio', 0.8, 6720], ['monthly', 3000, 3000], ['unpaid', 0, 0]] as const)('supports a whole month with %s pay without inventing work hours', (payMode, value, expected) => {
    const profile = withPlan({ payMode, value })
    const stats = getMonthlyWorkStats(profile, [], [], [], end)
    expect(summary(profile).income).toBeCloseTo(expected)
    expect(stats).toMatchObject({ plannedSeconds: 0, workedSeconds: 0, totalWorkedSeconds: 0, averageHourlyIncome: null })
    expect(stats.expectedIncome).toBeCloseTo(expected)
    expect(actualPaidIntervalsForDate(profile, '2026-08-03', end)).toEqual([])
  })

  it('prorates partial vacations using original paid days, not every natural day', () => {
    const profile = withPlan({ startDate: '2026-08-03', endDate: '2026-08-07', payMode: 'ratio', value: 0.5 })
    expect(summary(profile).income).toBeCloseTo(8400 - 5 * 400 * 0.5)
    expect(salaryProfileForBusinessDate(profile, '2026-08-10', [], settings).monthlyWorkDays).toBe(21)
    expect(getVacationPayAmount('2026-08-08', salaryProfileForBusinessDate(withPlan(), '2026-08-08', [], settings), settings)).toBe(0)
  })

  it('keeps vacation pay on default duty and honors explicit daily pay changes', () => {
    const profile = withPlan({ payMode: 'monthly', value: 4200 })
    const duty: AttendanceRecord = { date: '2026-08-03', status: 'normal', updatedAt: end.toISOString() }
    expect(summary(profile, [duty]).income).toBeCloseTo(4200)
    expect(getMonthlyWorkStats(profile, [], [], [duty], end).workedSeconds).toBe(8 * 3600)
    const today = summarizeTodayWork(profile, [], new Date(2026, 7, 3, 18), undefined, [duty])
    expect(today).toMatchObject({ dayType: 'work', earnedAmount: 200 })
    expect(summary(profile, [{ ...duty, payMode: 'fixed', fixedAmount: 500 }]).income).toBeCloseTo(4500)
    expect(summary(profile, [{ ...duty, status: 'leave', payMode: 'unpaid' }]).income).toBeCloseTo(4000)
    expect(getMonthlyWorkStats(profile, [], [], [{ ...duty, status: 'leave', payMode: 'unpaid' }], end).expectedIncome).toBeCloseTo(4000)
    const weekend = { ...duty, date: '2026-08-08' }
    expect(summary(profile, [weekend]).income).toBeCloseTo(4200)
  })

  it('does not erase actual flexible sessions when a vacation is added', () => {
    const record: DailyWorkRecord = { date: '2026-08-03', mode: 'flexible', status: 'ended', sessions: [{ id: 'duty', startTime: new Date(2026, 7, 3, 9).toISOString(), endTime: new Date(2026, 7, 3, 11).toISOString() }], updatedAt: end.toISOString() }
    const profile = withPlan()
    expect(actualPaidIntervalsForDate(profile, record.date, end, [record])).toHaveLength(1)
    expect(summary(profile, [], [record]).income).toBeCloseTo(8400)
    expect(summarizeTodayWork(profile, [record], new Date(2026, 7, 3, 12))).toMatchObject({ workedSeconds: 7200, earnedAmount: 400 })
  })

  it('overrides national makeup days and alternating Saturdays, but manual duty wins', () => {
    const profile = { ...withPlan({ startDate: '2026-10-01', endDate: '2026-10-31' }), workWeekMode: 'alternating' as const }
    const national = { ...settings, enabled: true }
    expect(resolveAttendanceDay(new Date(2026, 9, 10, 12), profile, undefined, national)).toMatchObject({ isWorkday: false, source: 'vacation' })
    expect(resolveAttendanceDay(new Date(2026, 9, 10, 12), profile, { date: '2026-10-10', status: 'normal', updatedAt: '' }, national)).toMatchObject({ isWorkday: true, source: 'manual' })
  })

  it('shows an employed holiday and returns to work after the following weekend', () => {
    const profile = withPlan({ endDate: '2026-08-07' })
    const now = new Date(2026, 7, 7, 10)
    const work = summarizeTodayWork(profile, [], now)
    expect(work).toMatchObject({ dayType: 'holiday', vacationName: '暑假', workedSeconds: 0, earnedAmount: 400 })
    expect(getRestCountdown(profile, work, now, [], [], settings).vacation).toMatchObject({ value: '还剩 1 天', hint: '2026-08-07 结束 · 2026-08-10 恢复上班' })
    expect(summarizeTodayWork(profile, [], new Date(2026, 7, 10, 10)).dayType).toBe('work')
  })

  it('binds holidays to their job and clips their effect after an employment date change', () => {
    const stage: WorkStage = { id: 'school', name: '学校', company: '', role: '', startDate: '2026-01-01', endDate: '2026-08-14', profile: base, createdAt: '' }
    const next: WorkStage = { ...stage, id: 'next', startDate: '2026-08-15', endDate: null }
    const vacation = { ...plan, stageId: stage.id }
    const profile = { ...base, vacations: [vacation], workJourney: { version: 1 as const, revision: 1, stages: [stage, next] } }
    expect(vacationForDate(profile, '2026-08-14')?.id).toBe('summer')
    expect(vacationForDate(profile, '2026-08-15')).toBeUndefined()
    expect(vacationRange(vacation, stage)).toMatchObject({ end: '2026-08-14', clipped: true })
    expect(getVacationPayAmount('2026-08-03', salaryProfileForBusinessDate(profile, '2026-08-03', [], settings), settings)).toBeCloseTo(400)
    const outside = { ...profile, vacations: [{ ...vacation, startDate: '2026-08-20' }] }
    expect(salaryProfileForBusinessDate(outside, '2026-08-03', [], settings).monthlyWorkDays).toBe(base.monthlyWorkDays)
  })

  it('keeps cross-month annual salary and fixed deductions stable', () => {
    const profile = { ...withPlan({ startDate: '2026-07-01', endDate: '2026-08-31' }), salaryType: 'annual' as const, salary: 100800, salaryDeductions: [{ id: 'insurance', name: '社保', type: 'fixed' as const, value: 400, enabled: true }] }
    for (const month of [6, 7]) {
      const total = summarizeLedger(profile, [], new Date(2026, month, 1), new Date(2026, month + 1, 1), end, [], [])
      expect(total.income).toBeCloseTo(8000)
    }
  })

  it('does not shift payday because of personal vacations', () => {
    const profile = withPlan()
    const value = getPaydayCountdown(10, new Date(2026, 7, 1), { adjustment: 'previous-workday', isWorkday: date => isConfiguredWorkday(date, { ...profile, vacations: undefined }, settings) })
    expect(value?.nextPayday.getDate()).toBe(10)
    expect(value?.adjusted).toBe(false)
  })
})

describe('vacation editing', () => {
  it('validates overlapping ranges, impossible dates and invalid pay values', () => {
    expect(validateVacation({ ...plan, id: 'other' }, withPlan())).toContain('重叠')
    expect(validateVacation({ ...plan, endDate: '2026-02-30' }, base)).toContain('日期')
    expect(validateVacation({ ...plan, payMode: 'ratio', value: 1.2 }, base)).toContain('比例')
    expect(validateVacation({ ...plan, endDate: '2027-08-31' }, base)).toContain('366')
  })

  it('previews edits and deletion without changing existing attendance or timers', () => {
    saveJSON(keys.workRecords, [{ date: '2026-08-03', mode: 'scheduled', status: 'ended', sessions: [], updatedAt: '' }])
    const before = localStorage.getItem(keys.workRecords)
    const impact = vacationImpact(withPlan({ payMode: 'unpaid', value: 0 }), [], [plan])
    expect(impact.rows[0].after).toBeGreaterThan(impact.rows[0].before)
    expect(impact.preservedDays).toBe(1)
    expect(localStorage.getItem(keys.workRecords)).toBe(before)
  })

  it('persists a plan, rejects stale edits, and reports storage failures', async () => {
    saveJSON(keys.profile, base)
    const initial = loadProfile()
    expect(await saveVacations(initial, [plan])).toBeNull()
    expect(loadProfile().vacations).toEqual([plan])
    expect(await saveVacations(initial, [])).toContain('更新')
    expect(saveProfile(initial)).toBeNull()
    const current = loadProfile()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(await saveVacations(current, [])).toContain('保存失败')
    expect(loadProfile().vacations).toEqual([plan])
  })

  it('attaches legacy vacations on first journey setup and preserves their original dates', async () => {
    saveJSON(keys.profile, withPlan())
    const profile = loadProfile()
    const stage: WorkStage = { id: 'school', name: '学校', company: '', role: '', startDate: '2026-08-10', endDate: null, profile: profileSnapshot(base), createdAt: '' }
    expect(await commitJourney(profile, [stage])).toBeNull()
    const next = loadProfile()
    expect(next.vacations?.[0]).toMatchObject({ stageId: 'school', startDate: '2026-08-01' })
    expect(vacationForDate(next, '2026-08-09')).toBeUndefined()
    expect(vacationForDate(next, '2026-08-10')?.name).toBe('暑假')
    expect(stageDays(next, stage, new Date(2026, 7, 10, 18))[0]).toMatchObject({ label: '暑假', seconds: 0 })
    expect(stage.profile?.vacations).toBeUndefined()
  })
})


describe('vacation integration regressions', () => {
  it('keeps average monthly estimates unchanged outside the effective vacation month', () => {
    const now = new Date(2026, 8, 30, 23)
    const ordinary = getMonthlyWorkStats(base, [], [], [], now)
    expect(getMonthlyWorkStats(withPlan(), [], [], [], now).expectedIncome).toBe(ordinary.expectedIncome)
    expect(getMonthlyWorkStats(withPlan({ startDate: '2026-10-01', endDate: '2026-10-31' }), [], [], [], now).expectedIncome).toBe(ordinary.expectedIncome)
    expect(ordinary.expectedIncome).toBeCloseTo(8400)
  })

  it.each([['normal', 1, 400], ['ratio', 0.5, 200], ['monthly', 2100, 100], ['unpaid', 0, 0]] as const)('settles flexible duty with %s vacation pay', (payMode, value, expected) => {
    const profile = withPlan({ payMode, value })
    const record: DailyWorkRecord = { date: '2026-08-03', mode: 'flexible', status: 'ended', sessions: [{ id: 'duty', startTime: new Date(2026, 7, 3, 9).toISOString(), endTime: new Date(2026, 7, 3, 20).toISOString() }], updatedAt: end.toISOString() }
    const work = summarizeTodayWork(profile, [record], new Date(2026, 7, 3, 21))
    expect(getFlexibleBaseSettlementAmount(undefined, 400, work.earnedAmount)).toBe(expected)
    expect(getFlexibleBaseSettlementAmount({ date: record.date, status: 'normal', payMode: 'fixed', fixedAmount: 50, updatedAt: '' }, 400, work.earnedAmount)).toBe(50)
    expect(getAutomaticFlexibleSettlementMode('monthly', 7200, 28800, true)).toBe('actual')
    expect(getAutomaticFlexibleSettlementMode('monthly', 36000, 28800, true)).toBeNull()
  })

  it('uses clipped upcoming dates consistently in the home countdown and journey summary', () => {
    const stage: WorkStage = { id: 'school', name: '学校', company: '', role: '', startDate: '2026-08-10', endDate: '2026-08-20', profile: base, createdAt: '' }
    const profile: SalaryProfile = { ...base, vacations: [{ ...plan, stageId: stage.id }], workJourney: { version: 1, revision: 1, stages: [stage] } }
    const now = new Date(2026, 7, 9, 12)
    const work = summarizeTodayWork(profile, [], now)
    expect(getRestCountdown(profile, work, now, [], [], settings).vacation).toEqual({ label: '距离暑假', value: '1 天', hint: '2026-08-10 至 2026-08-20' })
    expect(stageVacationSummary(profile, stage, '2026-08-09')).toBe('2026-08-10 起 暑假')
    expect(getRestCountdown(profile, summarizeTodayWork(profile, [], new Date(2026, 7, 20, 12)), new Date(2026, 7, 20, 12), [], [], settings).vacation?.hint).toContain('之后暂无上班安排')
  })

  it('recognizes recorded weekend duty as the next return, with manual rest taking priority', () => {
    const profile = withPlan({ endDate: '2026-08-07' })
    const now = new Date(2026, 7, 7, 10)
    const record: DailyWorkRecord = { date: '2026-08-08', mode: 'scheduled', status: 'ready', sessions: [], updatedAt: '' }
    const work = summarizeTodayWork(profile, [], now)
    expect(getRestCountdown(profile, work, now, [], [record], settings).vacation?.hint).toContain('2026-08-08 恢复上班')
    expect(getRestCountdown(profile, work, now, [{ date: record.date, status: 'holiday', updatedAt: '' }], [record], settings).vacation?.hint).toContain('2026-08-10 恢复上班')
  })

  it('keeps paid rest out of wish work progress and its native timeline', () => {
    const profile = withPlan({ endDate: '2026-08-07' })
    const now = new Date(2026, 7, 7, 18)
    const wish = { id: 'wish', name: '耳机', price: 100, createdAt: new Date(2026, 7, 3, 9).toISOString() }
    const progress = getWishProgress(wish, profile, now)
    expect(progress.earnedAmount).toBe(0)
    expect(progress.estimatedAt).toEqual(new Date(2026, 7, 10, 11))
    const native = buildWishWidgetSnapshot(profile, [wish], [wish.id], [], [], now)
    expect(native.wishes[0].earnedAmount).toBe(0)
    expect(native.timeline[0].startAt).toBe(new Date(2026, 7, 10, 9).getTime())
  })

  it('executes vacation reservations without inventing slacking income or losing independent overtime', () => {
    saveJSON(keys.profile, withPlan())
    const startTime = new Date(2026, 7, 3, 9).toISOString()
    const endTime = new Date(2026, 7, 3, 10).toISOString()
    for (const kind of ['slacking', 'overtime'] as const) expect(saveTimerPlan({ id: kind, kind, startTime, endTime, status: 'scheduled', payMode: 'fixed', fixedAmount: 80 }, new Date(2026, 7, 3, 8))).toBeNull()
    expect(reconcileTimerPlans(new Date(2026, 7, 3, 11)).error).toBeNull()
    expect(loadJSON<SlackingSession[]>(keys.sessions, [])[0]).toMatchObject({ durationSeconds: 3600, paidDurationSeconds: 0, earnedAmount: 0 })
    expect(loadJSON<OvertimeSession[]>(keys.overtimeSessions, [])[0]).toMatchObject({ durationSeconds: 3600, earnedAmount: 80 })
    expect(reconcileTimerPlans(new Date(2026, 7, 3, 12)).changed).toBe(false)
  })

  it.each([false, true])('separates native salary and actual work timelines with duty=%s', duty => {
    const profile = withPlan({ payMode: 'ratio', value: 0.5 })
    const now = new Date(2026, 7, 3, 9)
    const finish = new Date(2026, 7, 3, 14)
    const attendance: AttendanceRecord[] = duty ? [{ date: '2026-08-03', status: 'normal', updatedAt: '' }] : []
    const snapshot = buildWidgetSnapshot({ profile, workRecords: [], attendanceRecords: attendance, now, horizonMs: finish.getTime() - now.getTime() })
    expect(snapshot.workTimeline.every(segment => segment.ratePerSecond === 0 && segment.baseAmount === 200)).toBe(true)
    const slices = snapshot.paidWorkTimeline ?? []
    const seconds = slices.reduce((sum, segment) => sum + (segment.endAt - segment.startAt) / 1000, 0)
    const amount = slices.reduce((sum, segment) => sum + (segment.endAt - segment.startAt) / 1000 * segment.ratePerSecond, 0)
    const web = calculatePaidTimeEarnings(profile, now, finish, [], attendance, settings)
    expect(seconds).toBe(web.paidSeconds)
    expect(amount).toBeCloseTo(web.earnedAmount)
    expect(seconds).toBe(duty ? 4 * 3600 : 0)
  })
})
