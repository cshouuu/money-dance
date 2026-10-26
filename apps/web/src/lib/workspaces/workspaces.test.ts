import { mergeSpaceTimelines } from './widget'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, workProfileForDate } from '@salary-flow/core'
import { keys } from '../storage'
import { createBackup, importBackup, backupFingerprint, parseBackup, serializeBackup } from '../backup'
import { getSummaryRange, summarizeLedger } from '../ledger'
import { archiveSpace, changeSpaceTimer } from './actions'
import { summarizeSpaces, monthlySpaceStats } from './queries'
import { commitWorkspaces, loadSpaces, loadWorkspaceStore, newSpace, replaceSpace, reviseSpace } from './store'
import { emptyWorkspaceStore, WORKSPACES_KEY } from './model'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear() }
}
const now = new Date('2026-10-09T20:00:00')
const period = getSummaryRange('day', '2026-10-09')
const hourSpace = () => {
  const space = newSpace('周末兼职', 'parttime', 100, '2026-10-01')
  space.workRecords = [{ date: '2026-10-09', mode: 'flexible', status: 'ended', actualHoursOnly: true, settlementMode: 'actual',
    sessions: [{ id: 'work', startTime: new Date('2026-10-09T08:00:00').toISOString(), endTime: new Date('2026-10-09T18:00:00').toISOString() }], updatedAt: now.toISOString() }]
  return space
}
beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
  localStorage.setItem(keys.profile, JSON.stringify({ ...DEFAULT_PROFILE, salary: 10000, salaryEffectiveDate: '2026-10-01' }))
})

describe('workspaces business boundaries', () => {
  it('creates same-template spaces with independent identities and no copied costs or records', () => {
    const first = hourSpace(); const second = newSpace('另一份兼职', 'parttime', 180, '2026-10-01')
    expect(second.id).not.toBe(first.id)
    expect(second.workRecords).toEqual([])
    expect(second.profile.includeLivingCost).toBe(false)
    expect(second.profile.livingCostHistory).toEqual([])
    expect(second.profile.salary).toBe(180)
  })
  it('retains original profile, ledger, wishes and generated salary without destructive migration', async () => {
    const before = loadSpaces()[0]
    const salary = summarizeLedger(before.profile, before.ledger, period.start, period.end, now, before.workRecords, before.attendanceRecords)
    const wish = JSON.stringify([{ id: 'original', name: '电脑', price: 1000, createdAt: now.toISOString() }])
    localStorage.setItem(keys.wishes, wish)
    const primary = localStorage.getItem(keys.profile)
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [hourSpace()] }))
    expect(localStorage.getItem(keys.profile)).toBe(primary)
    expect(localStorage.getItem(keys.wishes)).toBe(wish)
    const after = summarizeSpaces(loadSpaces(), period.start, period.end, now, 'primary')
    expect(after.income).toBeCloseTo(salary.income)
    expect(after.entries.map(entry => entry.id)).toEqual(salary.entries.map(entry => entry.id))
  })
  it('pays ten actual hours without a daily cap and does not infer a full day without work', () => {
    const space = hourSpace()
    expect(summarizeSpaces([space], period.start, period.end, now).income).toBeCloseTo(1000)
    expect(summarizeSpaces([{ ...space, workRecords: [] }], period.start, period.end, now).income).toBe(0)
  })
  it('keeps salary identities separate for the same business day', () => {
    const first = hourSpace(); const second = hourSpace()
    const result = summarizeSpaces([first, second], period.start, period.end, now)
    expect(result.income).toBeCloseTo(2000)
    expect(new Set(result.entries.map(entry => entry.id)).size).toBe(2)
    expect(summarizeSpaces([first, second], period.start, period.end, now, second.id).income).toBeCloseTo(1000)
  })
  it('isolates same-day attendance adjustments and rule effective dates', () => {
    const first = hourSpace(); const second = hourSpace()
    first.attendanceRecords = [{ date: '2026-10-09', status: 'leave', payMode: 'unpaid', updatedAt: now.toISOString() }]
    const revised = reviseSpace(second, { ...second.profile, salary: 200 }, '2026-10-10')
    expect(summarizeSpaces([first, revised], period.start, period.end, now).income).toBeCloseTo(1000)
    expect(second.profile.salary).toBe(100)
  })
  it('saves a dated editor profile after derived absent fields are omitted from JSON', async () => {
    const space = hourSpace()
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [space] }))
    const draft = { ...workProfileForDate(space.profile, '2026-10-09'), salary: 180 }
    const next = reviseSpace(space, draft, '2026-10-09')
    await commitWorkspaces(loadWorkspaceStore(), store => replaceSpace(store, next))
    expect(workProfileForDate(loadWorkspaceStore().spaces[0].profile, '2026-10-09').salary).toBe(180)
  })
  it('retains historical pay but stops automatic future pay after archiving', () => {
    const space = newSpace('合同工作', 'fixed', 12000, '2026-10-01')
    space.holidaySettings.enabled = false
    const archived = archiveSpace(space, '2026-10-08')
    expect(summarizeSpaces([archived], period.start, period.end, now).income).toBe(0)
    const yesterday = getSummaryRange('day', '2026-10-08')
    expect(summarizeSpaces([archived], yesterday.start, yesterday.end, now).income).toBeGreaterThan(0)
  })
  it('merges native earnings across separate time boundaries', () => {
    const combined = mergeSpaceTimelines([
      [{ startAt: 0, endAt: 2000, baseAmount: 10, ratePerSecond: 1 }],
      [{ startAt: 1000, endAt: 2000, baseAmount: 3, ratePerSecond: 2 }],
    ])
    expect(combined).toEqual([{ startAt: 0, endAt: 1000, baseAmount: 10, ratePerSecond: 1 },
      { startAt: 1000, endAt: 2000, baseAmount: 14, ratePerSecond: 3 }])
  })
  it('does not forecast a whole month of unplanned hourly work', () => {
    const space = newSpace('接单', 'freelance', 300, '2026-10-01')
    const stats = monthlySpaceStats([space], now)
    expect(stats.expectedIncome).toBe(0)
    expect(stats.plannedSeconds).toBe(0)
  })
  it('rejects stale whole-container saves and preserves both spaces', async () => {
    const expected = loadWorkspaceStore()
    await commitWorkspaces(expected, store => ({ ...store, spaces: [hourSpace()] }))
    await expect(commitWorkspaces(expected, store => ({ ...store, spaces: [] }))).rejects.toThrow('已更新')
    expect(loadWorkspaceStore().spaces).toHaveLength(1)
  })
  it('does not claim persistence when storage is full', async () => {
    const expected = loadWorkspaceStore()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await expect(commitWorkspaces(expected, store => ({ ...store, spaces: [hourSpace()] }))).rejects.toThrow('保存失败')
    expect(loadWorkspaceStore()).toEqual(emptyWorkspaceStore())
  })
  it('backs up the entire space container using version 2 and restores without duplication', async () => {
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [hourSpace()] }))
    const backup = createBackup('web')
    expect(backup.version).toBe(2)
    const parsed = parseBackup(serializeBackup(backup))
    const target = storage()
    importBackup(parsed, backupFingerprint(target), target)
    importBackup(parsed, backupFingerprint(target), target)
    expect(JSON.parse(target.getItem(WORKSPACES_KEY)!)).toEqual(loadWorkspaceStore())
  })
  it('rejects unknown or duplicated space identities in backups', async () => {
    const space = hourSpace()
    await expect(commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [space, space] }))).rejects.toThrow('格式不正确')
  })
  it('blocks simultaneous work timers across spaces, and keeps the active owner after reads', async () => {
    const first = newSpace('一', 'parttime', 100, '2026-10-01'); const second = newSpace('二', 'parttime', 200, '2026-10-01')
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [first, second] }))
    await changeSpaceTimer(first.id, 'start', new Date('2026-10-09T09:00:37'))
    expect(loadWorkspaceStore().spaces[0].workRecords[0].sessions[0].startTime).toBe(new Date('2026-10-09T09:00:37').toISOString())
    loadSpaces()
    await expect(changeSpaceTimer(second.id, 'start', new Date('2026-10-09T09:01:00'))).rejects.toThrow('仍在计时')
    expect(() => createBackup('web')).toThrow('空间')
    await changeSpaceTimer(first.id, 'finish', new Date('2026-10-09T10:00:00'))
    expect(loadWorkspaceStore().spaces[0].workRecords[0].status).toBe('ended')
    await changeSpaceTimer(second.id, 'start', new Date('2026-10-09T10:01:00'))
    expect(loadWorkspaceStore().spaces[1].workRecords[0].status).toBe('working')
  })
  it('computes weighted aggregate hourly rates instead of adding rates', () => {
    const first = hourSpace(); const second = hourSpace(); second.profile = reviseSpace(second, { ...second.profile, salary: 200 }, '2026-10-01').profile
    const stats = monthlySpaceStats([first, second], now)
    expect(stats.salaryIncome).toBeCloseTo(3000)
    expect(stats.averageHourlyIncome).toBeCloseTo(150)
  })
  it('does not replace another space when editing one space', async () => {
    const first = hourSpace(); const second = hourSpace()
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [first, second] }))
    await commitWorkspaces(loadWorkspaceStore(), store => replaceSpace(store, { ...first, name: '新名字' }))
    expect(loadWorkspaceStore().spaces[1]).toEqual(second)
  })
})
