import { isEmployedOn } from '@salary-flow/core'
import { closeActiveWorkSession, getCurrentWorkRecord, resumeFlexibleWork, settleFlexibleWorkRecord, startFlexibleWork, upsertWorkRecord } from '../work'
import { toLocalDateValue, toLocalTimeValue } from '../form'
import { commitWorkspaces, loadWorkspaceStore, primarySpace, replaceSpace } from './store'
import type { WorkSpace } from './model'
import { isSessionLocalDate } from '../sessionBusinessDate'
import { createId } from '../id'
import { loadLedger, localDateAtNoon, saveLedger } from '../ledger'
import { PRIMARY_SPACE_ID } from './model'
import type { LedgerEntry } from '../../types'

export async function recordSpaceIncome(spaceId: string, source: string, amount: number, date: string, now = new Date()) {
  if (!source.trim() || source.trim().length > 50 || !Number.isFinite(amount) || amount <= 0 || amount > 999999999) throw new Error('请填写收入名称和有效金额。')
  if (!isSessionLocalDate(date) || date > toLocalDateValue(now)) throw new Error('请选择有效的实际到账日期。')
  const entry: LedgerEntry = { id: createId(), kind: 'manual', direction: 'income', source: source.trim(), amount,
    localDate: date, occurredAt: localDateAtNoon(date).toISOString() }
  if (spaceId === PRIMARY_SPACE_ID) {
    if (!saveLedger([...loadLedger(), { ...entry, spaceId: PRIMARY_SPACE_ID }])) throw new Error('收入未保存，请检查存储空间。')
    return
  }
  await commitWorkspaces(loadWorkspaceStore(), store => {
    const space = store.spaces.find(item => item.id === spaceId)
    if (!space) throw new Error('工作空间不存在。')
    return replaceSpace(store, { ...space, ledger: [...space.ledger, entry] })
  })
}

export async function setSpaceIncomeDeleted(spaceId: string, entryId: string, deleted: boolean) {
  const change = (ledger: LedgerEntry[]) => {
    const entry = ledger.find(item => item.id === entryId)
    if (!entry || entry.kind !== 'manual') throw new Error('该记录无法在此修改。')
    return ledger.map(item => item.id === entryId ? { ...item, deleted } : item)
  }
  if (spaceId === PRIMARY_SPACE_ID) {
    if (!saveLedger(change(loadLedger()))) throw new Error('收入记录未更新，请检查存储空间。')
    return
  }
  await commitWorkspaces(loadWorkspaceStore(), store => {
    const space = store.spaces.find(item => item.id === spaceId)
    if (!space) throw new Error('工作空间不存在。')
    return replaceSpace(store, { ...space, ledger: change(space.ledger) })
  })
}

export function runningSpace(spaces: readonly WorkSpace[]): WorkSpace | undefined {
  return spaces.find(space => space.workRecords.some(record => record.sessions.some(session => !session.endTime)))
}

export async function changeSpaceTimer(spaceId: string, action: 'start' | 'pause' | 'finish', now = new Date()) {
  const expected = loadWorkspaceStore()
  await commitWorkspaces(expected, current => {
    const space = current.spaces.find(item => item.id === spaceId)
    if (!space || space.archivedOn) throw new Error('空间不存在或已归档。')
    const record = getCurrentWorkRecord(space.workRecords, now)
    if (action === 'start') {
      const active = runningSpace([primarySpace(), ...current.spaces])
      if (active) throw new Error(`「${active.name}」仍在计时，请先暂停。`)
      if (!isEmployedOn(space.profile, toLocalDateValue(now))) throw new Error('当前不在该空间的任职日期内。')
    }
    if (action !== 'start' && !record) throw new Error('没有可操作的工作记录。')
    const next = action === 'start'
      ? record ? resumeFlexibleWork(record, now) : startFlexibleWork(toLocalDateValue(now), toLocalTimeValue(now))
      : action === 'pause' ? closeActiveWorkSession(record!, 'paused', now)
      : settleFlexibleWorkRecord(closeActiveWorkSession(record!, 'ended', now), 'actual')
    if (action === 'start' && !record) next.sessions = next.sessions.map(session => ({ ...session, startTime: now.toISOString() }))
    next.updatedAt = now.toISOString()
    next.actualHoursOnly = true
    return replaceSpace(current, { ...space, workRecords: upsertWorkRecord(space.workRecords, next) })
  })
}

export function archiveSpace(space: WorkSpace, lastDay: string): WorkSpace {
  if (!isSessionLocalDate(lastDay)) throw new Error('请选择有效的最后任职日。')
  if (space.workRecords.some(record => ['working', 'paused'].includes(record.status) || record.settlementPending)) throw new Error('请先结束该空间计时并完成结算。')
  const journey = space.profile.workJourney
  const stage = journey?.stages.at(-1)
  if (!journey || !stage || lastDay < stage.startDate) throw new Error('最后任职日不能早于开始日期。')
  if (space.workRecords.some(record => record.date > lastDay) || space.attendanceRecords.some(record => record.date > lastDay)) throw new Error('最后任职日之后还有工作或出勤记录，请先核对日期。')
  return { ...space, archivedOn: lastDay, profile: { ...space.profile, workJourney: { ...journey, revision: journey.revision + 1,
    stages: journey.stages.map(item => item.id === stage.id ? { ...item, endDate: lastDay } : item) } } }
}
