import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { keys } from './storage'
import { BACKUP_KEYS, RECOVERY_KEY, backupFingerprint, createBackup, importBackup, parseBackup, previousBackup, recoverInterruptedImport, serializeBackup, type Backup } from './backup'
import { HOLIDAY_KEY, PLANS_KEY, THEME_KEY, UNDO_KEY } from './backupSchema'
import holidayData from './chinaHolidays.data.json'
import { CHINA_HOLIDAY_DATA_KEY } from './chinaHolidays'
import legacyRecovery from './fixtures/backup-recovery-v0.6.0.json'

function store(seed: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]))
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
const at = '2026-09-15T09:00:00.000Z'
const until = '2026-09-15T10:00:00.000Z'
const wish = { id: 'wish-1', name: '旅行', price: 5000, createdAt: at }
const fixture: Record<string, unknown> = {
  [CHINA_HOLIDAY_DATA_KEY]: { ...holidayData, version: '2027.2' },
  [keys.profile]: { ...DEFAULT_PROFILE, salary: 19000,
    workJourney: { version: 1, revision: 2, stages: [{ id: 'job', name: '第一份工作', company: '公司', role: '开发', startDate: '2026-01-01', endDate: null, profile: DEFAULT_PROFILE, createdAt: at }] },
    workSettingsHistory: [{ stageId: 'job', effectiveFrom: '2026-09-01', settings: { ...DEFAULT_PROFILE, salary: 19000 } }],
    vacations: [{ id: 'v', stageId: 'job', name: '休假', kind: 'custom', startDate: '2026-10-01', endDate: '2026-10-07', payMode: 'normal', value: 1 }],
    rosters: [{ id: 'r', stageId: 'job', effectiveFrom: '2026-01-01', enabled: true, mode: 'manual', anchorDate: '2026-01-01', templates: [], cycle: [], overrides: [], respectVacations: true, respectHolidays: true, pay: { mode: 'salary', value: 0, basis: 'planned', monthlyHours: 160, overtime: 'manual', overtimeValue: 0 } }],
  },
  [keys.wishes]: [wish], [keys.wishAllocation]: { version: 1, adoptedAt: at, initial: [wish], revisions: [] },
  [keys.mobileDock]: ['/', '/convert', '/slacking', '/settings'], [keys.widgetWishes]: ['wish-1', '', ''],
  [keys.sessions]: [{ id: 's', startTime: at, endTime: until, durationSeconds: 3600, earnedAmount: 100, startLocalDate: '2026-09-15', startTimezoneOffsetMinutes: -480 }],
  [keys.overtimeSessions]: [{ id: 'o', startTime: at, endTime: until, durationSeconds: 3600, earnedAmount: 100, payMode: 'fixed', fixedAmount: 100 }],
  [keys.achievements]: { version: 1, slacking: { lifetimeSeconds: 3600, processedSessionIds: ['s'], highestLevel: 1, unlockedAt: { 'slacking-1': until }, creditedSecondsBySessionId: { s: 3600 } }, overtime: { lifetimeSeconds: 3600, processedSessionIds: ['o'], highestLevel: 1, unlockedAt: {} } },
  [keys.assets]: [{ id: 'a', name: '电脑', price: 8000, purchaseDate: at, createdAt: at, category: '数码' }],
  [keys.ledger]: [{ id: 'l', kind: 'manual', direction: 'income', amount: 200, source: '奖金', occurredAt: at, localDate: '2026-09-15', deleted: false }],
  [keys.workRecords]: [{ date: '2026-09-15', mode: 'flexible', status: 'ended', sessions: [{ id: 'work', startTime: at, endTime: until }], updatedAt: until }],
  [keys.attendanceRecords]: [{ date: '2026-09-15', status: 'leave', leaveType: 'annual', updatedAt: at }],
  [HOLIDAY_KEY]: { enabled: true, effectiveFrom: '2026-01-01', dataVersion: '2026' }, [THEME_KEY]: 'cloud-river',
  [PLANS_KEY]: [{ id: 'p', kind: 'slacking', startTime: at, status: 'completed' }],
}
const backup = (): Backup => createBackup('android', store(fixture))

describe('cross-platform backups', () => {
  it('includes every shared storage key except the deliberately blocked active timers', () => {
    expect(Object.values(keys).filter(key => ![keys.activeSlacking, keys.activeOvertime].includes(key)).every(key => BACKUP_KEYS.includes(key))).toBe(true)
  })
  it('round-trips every shared domain without changing dates, amounts or legacy optional fields', () => {
    expect(Object.keys(fixture).sort()).toEqual([...BACKUP_KEYS].sort())
    const from = store({ ...fixture, unrelated: 'private', [UNDO_KEY]: { old: true } })
    const exported = parseBackup('\uFEFF' + serializeBackup(createBackup('android', from)))
    const target = store({ [keys.profile]: { ...DEFAULT_PROFILE, salary: 7000 }, unrelated: 'keep', [UNDO_KEY]: { old: true } })
    importBackup(exported, backupFingerprint(target), target)
    for (const [key, value] of Object.entries(fixture)) expect(JSON.parse(target.getItem(key)!)).toEqual(value)
    expect(target.getItem('unrelated')).toBe('"keep"')
    expect(target.getItem(UNDO_KEY)).toBeNull()
    expect(exported.data).not.toHaveProperty('unrelated')
    expect(previousBackup(target)?.data[keys.profile]).toMatchObject({ salary: 7000 })
    expect(recoverInterruptedImport(target)).toBe(false)
  })
  it('replaces missing domains rather than leaving a mixture of two users data', () => {
    const target = store(fixture)
    importBackup(createBackup('web', store({ [keys.profile]: { salary: 123, salaryType: 'monthly' } })), backupFingerprint(target), target)
    expect(target.getItem(keys.wishes)).toBeNull()
    expect(target.getItem(CHINA_HOLIDAY_DATA_KEY)).toBeNull()
    expect(JSON.parse(target.getItem(keys.profile)!)).toEqual({ salary: 123, salaryType: 'monthly' })
  })
  it('does not duplicate records on repeated imports', () => {
    const target = store()
    for (let i = 0; i < 2; i++) importBackup(backup(), backupFingerprint(target), target)
    expect(JSON.parse(target.getItem(keys.ledger)!)).toHaveLength(1)
  })
  it('cancels scheduled timers on import while preserving completed history', () => {
    const data = backup()
    data.data[PLANS_KEY] = [{ id: 'p', kind: 'slacking', startTime: at, status: 'scheduled' }]
    const target = store()
    importBackup(data, backupFingerprint(target), target)
    expect(JSON.parse(target.getItem(PLANS_KEY)!)[0]).toMatchObject({ id: 'p', status: 'cancelled' })
  })
  it.each([keys.activeSlacking, keys.activeOvertime])('blocks unsettled %s on both source and destination', key => {
    const active = store({ [key]: { startTime: at } })
    expect(() => createBackup('web', active)).toThrow('计时')
    expect(() => importBackup(backup(), backupFingerprint(active), active)).toThrow('计时')
    expect(active.getItem(RECOVERY_KEY)).toBeNull()
  })
  it('blocks paused work and pending settlements', () => {
    for (const extra of [{ status: 'paused' }, { status: 'ended', settlementPending: true }]) {
      const active = store({ [keys.workRecords]: [{ ...extra, sessions: [] }] })
      expect(() => createBackup('web', active)).toThrow('结算')
    }
  })
  it('rejects changes made after the import preview', () => {
    const target = store(fixture), expected = backupFingerprint(target)
    target.setItem(keys.ledger, '[]')
    expect(() => importBackup(backup(), expected, target)).toThrow('已发生变化')
    expect(target.getItem(RECOVERY_KEY)).toBeNull()
  })
  it('rejects unreadable local data without exporting an empty replacement', () => {
    const target = store(); target.setItem(keys.profile, '{broken')
    expect(() => createBackup('web', target)).toThrow()
    expect(target.getItem(keys.profile)).toBe('{broken')
  })
})

describe('backup validation', () => {
  it.each([
    ['format', 'other'], ['version', 2], ['source', 'unknown'], ['exportedAt', 'bad'],
  ])('rejects invalid %s metadata', (key, value) => {
    expect(() => parseBackup(JSON.stringify({ ...backup(), [key]: value }))).toThrow()
  })
  it.each([
    { [keys.profile]: { salary: '19000', salaryType: 'monthly' } },
    { [keys.wishes]: [null] },
    { [keys.wishes]: [wish, wish] },
    { [keys.ledger]: [{ id: 'x', amount: -1 }] },
    { [keys.profile]: { ...DEFAULT_PROFILE, workJourney: { stages: null } } },
    { [keys.profile]: { ...DEFAULT_PROFILE, workSettingsHistory: [{ stageId: null, effectiveFrom: '2026-02-30', settings: DEFAULT_PROFILE }] } },
    { [keys.workRecords]: [{ date: '2026-09-15', mode: 'flexible', status: 'working', sessions: [], updatedAt: at }] },
    { [PLANS_KEY]: [{ id: 'p', kind: 'slacking', startTime: at, status: 'running' }] },
    { secret: 'not portable' },
  ])('rejects malformed or active data before touching storage %#', data => {
    const target = store(fixture), before = backupFingerprint(target)
    expect(() => importBackup({ ...backup(), data }, before, target)).toThrow()
    expect(backupFingerprint(target)).toBe(before)
    expect(target.getItem(RECOVERY_KEY)).toBeNull()
  })
  it('rejects prototype fields and excessive nesting', () => {
    const data = backup()
    expect(() => parseBackup(JSON.stringify(data).replace('"data":{', '"data":{"__proto__":{},'))).toThrow()
    const nested: Record<string, unknown> = {}; let next = nested
    for (let i = 0; i < 35; i++) { next.x = {}; next = next.x as Record<string, unknown> }
    expect(() => parseBackup(JSON.stringify({ ...data, data: nested }))).toThrow('层级')
  })
  it('rejects inconsistent wish allocation history', () => {
    const data = backup(); data.data[keys.wishes] = []
    expect(() => parseBackup(JSON.stringify(data))).toThrow('不一致')
  })
})

describe('import failure and crash recovery', () => {
  it('does not touch original data if the rollback copy cannot be stored', () => {
    const target = store(fixture), before = backupFingerprint(target)
    const fail = { ...target, setItem: () => { throw new Error('quota') } }
    expect(() => importBackup(backup(), before, fail)).toThrow('原数据未改动')
    expect(backupFingerprint(target)).toBe(before)
  })
  it('restores all old keys when a later write runs out of space', () => {
    const target = store({ [keys.profile]: { ...DEFAULT_PROFILE, salary: 9000 }, unrelated: 'keep' }), before = backupFingerprint(target)
    let failed = false
    const fail = { ...target, setItem: (key: string, value: string) => {
      if (key === keys.ledger && !failed) { failed = true; throw new Error('quota') }
      target.setItem(key, value)
    } }
    expect(() => importBackup(backup(), before, fail)).toThrow('已恢复原数据')
    expect(backupFingerprint(target)).toBe(before)
    expect(target.getItem('unrelated')).toBe('"keep"')
    expect(target.getItem(RECOVERY_KEY)).toBeNull()
  })
  it('retains a pending journal if rollback fails and restores before the next boot', () => {
    const target = store({ [keys.profile]: { ...DEFAULT_PROFILE, salary: 9000 } }), before = backupFingerprint(target)
    let broken = false
    const fail = { ...target, setItem: (key: string, value: string) => {
      if (key === keys.ledger) broken = true
      if (broken) throw new Error('disk error')
      target.setItem(key, value)
    } }
    expect(() => importBackup(backup(), before, fail)).toThrow('重新打开')
    expect(JSON.parse(target.getItem(RECOVERY_KEY)!).phase).toBe('pending')
    expect(recoverInterruptedImport(target)).toBe(true)
    expect(backupFingerprint(target)).toBe(before)
    expect(recoverInterruptedImport(target)).toBe(false)
  })
})

describe('recovery across app upgrades', () => {
  // Captured from v0.6.0 importBackup with synthetic data. Do not regenerate
  // this persisted format from the current backup key registry.
  it('boots after an old successful import without rolling back current data or rewriting the journal', () => {
    const target = store({ ...fixture, [RECOVERY_KEY]: legacyRecovery, unrelated: 'keep' })
    const before = new Map(target.values)
    expect(recoverInterruptedImport(target)).toBe(false)
    expect(target.values).toEqual(before)
    const previous = previousBackup(target)!
    expect(previous.data[keys.profile]).toEqual({ salary: 9000, salaryType: 'monthly' })
    expect(previous.data[keys.ledger]).toEqual([])
    expect(previous.data).not.toHaveProperty(CHINA_HOLIDAY_DATA_KEY)
    expect(parseBackup(serializeBackup(previous))).toEqual(previous)
    expect(target.values).toEqual(before)
  })

  it('restores an old interrupted import without deleting data added after its snapshot', () => {
    const target = store({ ...fixture, [RECOVERY_KEY]: { ...legacyRecovery, phase: 'pending' }, unrelated: 'keep' })
    const downloadedHolidays = target.getItem(CHINA_HOLIDAY_DATA_KEY)
    expect(recoverInterruptedImport(target)).toBe(true)
    for (const [key, value] of Object.entries(legacyRecovery.before)) expect(target.getItem(key)).toBe(value)
    expect(target.getItem(CHINA_HOLIDAY_DATA_KEY)).toBe(downloadedHolidays)
    expect(target.getItem('unrelated')).toBe('"keep"')
    expect(target.getItem(RECOVERY_KEY)).toBeNull()
    expect(recoverInterruptedImport(target)).toBe(false)
  })

  it('keeps an old pending journal when recovery fails and can safely retry it', () => {
    const target = store({ ...fixture, [RECOVERY_KEY]: { ...legacyRecovery, phase: 'pending' } })
    const journal = target.getItem(RECOVERY_KEY)
    const downloadedHolidays = target.getItem(CHINA_HOLIDAY_DATA_KEY)
    const fail = { ...target, setItem: () => { throw new Error('quota') } }
    expect(() => recoverInterruptedImport(fail)).toThrow('原数据恢复暂时失败')
    expect(target.getItem(RECOVERY_KEY)).toBe(journal)
    expect(target.getItem(CHINA_HOLIDAY_DATA_KEY)).toBe(downloadedHolidays)
    expect(recoverInterruptedImport(target)).toBe(true)
    for (const [key, value] of Object.entries(legacyRecovery.before)) expect(target.getItem(key)).toBe(value)
    expect(target.getItem(CHINA_HOLIDAY_DATA_KEY)).toBe(downloadedHolidays)
  })

  it('allows another import and snapshots the current data after an old completed import', () => {
    const target = store({ ...fixture, [RECOVERY_KEY]: legacyRecovery })
    const incoming = createBackup('web', store({ [keys.profile]: { salary: 123, salaryType: 'monthly' } }))
    importBackup(incoming, backupFingerprint(target), target)
    expect(JSON.parse(target.getItem(keys.profile)!)).toEqual(incoming.data[keys.profile])
    expect(previousBackup(target)?.data).toEqual(fixture)
    expect(recoverInterruptedImport(target)).toBe(false)
  })

  for (const phase of ['pending', 'complete']) {
    it.each(['missing base key', 'unexpected key', 'invalid added value', 'empty snapshot'])(`rejects %s in a ${phase} journal without writing data`, defect => {
      const saved = { ...legacyRecovery, phase, before: { ...legacyRecovery.before } as Record<string, unknown> }
      if (defect === 'missing base key') delete saved.before[keys.ledger]
      if (defect === 'unexpected key') saved.before['unknown-key'] = null
      if (defect === 'invalid added value') saved.before[CHINA_HOLIDAY_DATA_KEY] = 42
      if (defect === 'empty snapshot') saved.before = {}
      const target = store({ ...fixture, [RECOVERY_KEY]: saved })
      const before = new Map(target.values)
      expect(() => recoverInterruptedImport(target)).toThrow('导入恢复备份无法读取')
      expect(target.values).toEqual(before)
    })
  }
})
