import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, rosterForDate, workProfileForDate } from '@salary-flow/core'
import { applyWorkTemplate } from './templates'
import { commitWorkspaces, initializePrimarySpace, loadSpaces, loadWorkspaceStore, newSpace, reviseSpace } from './store'
import { loadProfile, saveDatedProfile } from '../profile'
import { templateForProfile, WORKSPACES_KEY } from './model'
import { workspaceNavigation } from './navigation'
import { recordSpaceIncome, setSpaceIncomeDeleted } from './actions'
import { getSummaryRange } from '../ledger'
import { monthlySpaceStats, summarizeSpaces } from './queries'
import { keys } from '../storage'
import { createBackup, parseBackup, serializeBackup } from '../backup'
import { getFlexibleEarnedAmount, getFlexibleOvertimeWindow, startFlexibleWork } from '../work'

const now = new Date('2026-10-14T18:00:00')
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) })
  localStorage.setItem(keys.profile, JSON.stringify({ ...DEFAULT_PROFILE, salary: 8000, salaryEffectiveDate: '2026-10-01' }))
})

describe('dated work templates', () => {
  it('does not forecast unrecorded hours for a primary freelance job', () => {
    localStorage.removeItem(keys.profile)
    initializePrimarySpace(newSpace('自由职业', 'freelance', 150, '2026-10-01'))
    const stats = monthlySpaceStats(loadSpaces(), now)
    expect(stats.income).toBe(0)
    expect(stats.expectedIncome).toBe(0)
    expect(stats.plannedSeconds).toBe(0)
  })
  it('initializes a real main-job journey and roster without overwriting another setup', () => {
    localStorage.removeItem(keys.profile)
    const space = newSpace('护理主业', 'nurse', 8000, '2026-10-01')
    initializePrimarySpace(space)
    expect(loadWorkspaceStore().primaryName).toBe('护理主业')
    expect(loadProfile(now).workTemplate).toBe('nurse')
    expect(rosterForDate(loadProfile(now), '2026-10-14')).toBeDefined()
    expect(() => initializePrimarySpace(newSpace('另一份', 'fixed', 1000, '2026-10-01'))).toThrow('已在其他页面')
    expect(loadProfile(now).salary).toBe(8000)
  })

  it('persists an intentional main-job roster transition but rejects a stale original', () => {
    localStorage.removeItem(keys.profile)
    initializePrimarySpace(newSpace('护理主业', 'nurse', 8000, '2026-10-01'))
    const expected = loadProfile(now)
    const draft = applyWorkTemplate(expected, 'freelance', '2026-10-20')
    expect(saveDatedProfile(expected, { ...draft, salary: 150 }, '2026-10-20', now)).not.toBeNull()
    const persisted = loadProfile(now)
    expect(rosterForDate(persisted, '2026-10-19')).toBeDefined()
    expect(rosterForDate(persisted, '2026-10-20')).toBeUndefined()
    expect(saveDatedProfile(expected, draft, '2026-10-20', now)).toBeNull()
  })
  it('starts rotation jobs in cycle mode and leaves hourly jobs without roster or copied costs', () => {
    expect(newSpace('工厂', 'factory', 8000, '2026-10-01').profile.rosters?.[0].mode).toBe('cycle')
    const hourly = newSpace('兼职', 'parttime', 80, '2026-10-01')
    expect(hourly.profile).toMatchObject({ salaryType: 'hourly', defaultWorkMode: 'flexible', includeLivingCost: false, workTemplate: 'parttime', breakPeriods: [] })
    expect(hourly.profile.rosters).toBeUndefined()
  })

  it('preserves historical job rules when a future template starts', () => {
    const original = newSpace('工作', 'fixed', 8000, '2026-10-01')
    const draft = applyWorkTemplate(original.profile, 'freelance', '2026-10-20')
    const changed = reviseSpace(original, { ...draft, salary: 150 }, '2026-10-20')
    expect(workProfileForDate(changed.profile, '2026-10-19')).toMatchObject({ workTemplate: 'fixed', salary: 8000, salaryType: 'monthly', defaultWorkMode: 'scheduled' })
    expect(workProfileForDate(changed.profile, '2026-10-20')).toMatchObject({ workTemplate: 'freelance', salary: 150, salaryType: 'hourly', defaultWorkMode: 'flexible' })
    expect(original.profile.workTemplate).toBe('fixed')
  })

  it('disables roster at the submitted date, not the date used when choosing a card', () => {
    const original = newSpace('护理', 'nurse', 8000, '2026-10-01')
    const draft = applyWorkTemplate(original.profile, 'freelance', '2026-10-14')
    const changed = reviseSpace(original, { ...draft, salary: 100 }, '2026-10-20')
    expect(rosterForDate(changed.profile, '2026-10-19')).toEqual(original.profile.rosters?.[0])
    expect(rosterForDate(changed.profile, '2026-10-20')).toBeUndefined()
  })

  it('restores the previous roster at the next saved rules boundary', () => {
    const original = newSpace('护理', 'nurse', 8000, '2026-10-01')
    const future = reviseSpace(original, { ...original.profile, salary: 9000 }, '2026-11-01')
    const draft = applyWorkTemplate(workProfileForDate(future.profile, '2026-10-14'), 'fixed', '2026-10-14')
    const changed = reviseSpace(future, draft, '2026-10-14')
    expect(rosterForDate(changed.profile, '2026-10-15')).toBeUndefined()
    expect(rosterForDate(changed.profile, '2026-11-01')?.enabled).toBe(true)
    expect(workProfileForDate(changed.profile, '2026-11-01').salary).toBe(9000)
  })

  it('keeps an old profile unchanged while identifying its existing work mode', () => {
    const old = { ...DEFAULT_PROFILE, defaultWorkMode: 'flexible' as const, salaryType: 'hourly' as const }
    const before = JSON.stringify(old)
    expect(templateForProfile(old, '2026-10-14')).toBe('freelance')
    expect(JSON.stringify(old)).toBe(before)
  })

  it('rejects switching a paused job until its work is settled', () => {
    const original = newSpace('兼职', 'parttime', 80, '2026-10-01')
    original.workRecords = [{ date: '2026-10-14', mode: 'flexible', status: 'paused', sessions: [], updatedAt: now.toISOString() }]
    expect(() => reviseSpace(original, original.profile, '2026-10-14')).toThrow('结算')
  })

  it('backs up the template, income goal and dated rules together', async () => {
    const original = newSpace('销售', 'sales', 5000, '2026-10-01')
    const changed = reviseSpace(original, { ...original.profile, monthlyIncomeTarget: 20000 }, '2026-10-14')
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [changed] }))
    const restored = parseBackup(serializeBackup(createBackup('web')))
    expect(JSON.stringify(restored)).toContain('monthlyIncomeTarget')
    expect(JSON.parse(localStorage.getItem(WORKSPACES_KEY)!).spaces[0].profile.workSettingsHistory.at(-1).settings.monthlyIncomeTarget).toBe(20000)
  })

  it('retains overtime navigation when any job needs it or has historical records', () => {
    const hourly = newSpace('兼职', 'parttime', 80, '2026-10-01')
    expect(workspaceNavigation([hourly], '2026-10-14').some(([path]) => path === '/overtime')).toBe(false)
    const fixed = newSpace('主业', 'fixed', 8000, '2026-10-01')
    expect(workspaceNavigation([hourly, fixed], '2026-10-14').some(([path]) => path === '/overtime')).toBe(true)
    hourly.ledger.push({ id: 'old', kind: 'overtime', direction: 'income', source: '历史加班', amount: 50, occurredAt: now.toISOString() })
    expect(workspaceNavigation([hourly], '2026-10-14').some(([path]) => path === '/overtime')).toBe(true)
  })

  it('keeps actual-hour records uncapped and never generates overtime after their target', () => {
    const record = { ...startFlexibleWork('2026-10-14', '08:00'), actualHoursOnly: true }
    const rates = { daily: 800, hourly: 100, minute: 100 / 60, second: 100 / 3600, paidSecondsPerDay: 8 * 3600 }
    expect(getFlexibleEarnedAmount(record, rates, 'hourly', now)).toBeCloseTo(1000)
    expect(getFlexibleOvertimeWindow(record, rates.paidSecondsPerDay, now)).toBeNull()
    expect(startFlexibleWork('2026-10-14', '19:00', record).actualHoursOnly).toBe(true)
  })
})

describe('attributed extra income', () => {
  it('counts a commission once in its space and public totals, then reverses and restores it', async () => {
    const sales = newSpace('销售', 'sales', 0, '2026-10-01')
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [sales] }))
    const { start, end } = getSummaryRange('month', '2026-10')
    await recordSpaceIncome(sales.id, '开单提成', 350, '2026-10-14', now)
    expect(summarizeSpaces(loadSpaces(), start, end, now, sales.id).income).toBe(350)
    const entry = loadWorkspaceStore().spaces[0].ledger[0]
    await setSpaceIncomeDeleted(sales.id, entry.id, true)
    expect(summarizeSpaces(loadSpaces(), start, end, now, sales.id).income).toBe(0)
    await setSpaceIncomeDeleted(sales.id, entry.id, false)
    expect(summarizeSpaces(loadSpaces(), start, end, now, sales.id).income).toBe(350)
    expect(loadWorkspaceStore().spaces[0].ledger).toHaveLength(1)
  })

  it('attributes legacy main-job commission without inventing a work stage', async () => {
    await recordSpaceIncome('primary', '提成', 350, '2026-10-14', now)
    const record = JSON.parse(localStorage.getItem(keys.ledger)!)[0]
    expect(record.spaceId).toBe('primary')
    expect(record.workStageId).toBeUndefined()
    const { start, end } = getSummaryRange('day', '2026-10-14')
    expect(summarizeSpaces(loadSpaces(), start, end, now, 'public').income).toBe(0)
    expect(summarizeSpaces(loadSpaces(), start, end, now, 'primary').entries.filter(entry => entry.source === '提成')).toHaveLength(1)
    expect(() => parseBackup(serializeBackup(createBackup('web')))).not.toThrow()
  })
})
