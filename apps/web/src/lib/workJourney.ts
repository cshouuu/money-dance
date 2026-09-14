import { validateRoster } from './rosterStorage'
import { rosterShiftsForDate } from '@salary-flow/core'
import { rosterDayLabel, shiftHours } from './roster'
import { calculateRates, vacationForDate, getBreakPeriods, getPaidSecondsPerDay, type SalaryProfile, type WorkStage } from '@salary-flow/core'
import type { ActiveOvertime } from '../types'
import { loadAttendanceRecords } from './attendance'
import { toLocalDateTime, toLocalDateValue, toLocalTimeValue } from './form'
import { createId } from './id'
import { loadLedger, summarizeLedger, summaryEntryDateValue } from './ledger'
import { loadProfile, profileFingerprint, settingsWorkStage, workSettingsSnapshot } from './profile'
import { isSessionLocalDate, shiftSessionLocalDate } from './sessionBusinessDate'
import { loadActiveSlacking } from './slacking'
import { keys, loadJSON, saveJSON } from './storage'
import { runReversibleStorageTransaction } from './storageTransaction'
import { loadTimerPlans, TIMER_PLANS_KEY, TIMER_PLANS_UPDATED, type TimerPlan } from './timerPlans'
import { loadWorkRecords } from './work'
import { actualPaidIntervalsForDate } from './paidTime'

export function profileSnapshot(profile: SalaryProfile): Omit<SalaryProfile, 'workJourney'> {
  const { workJourney: _journey, workSettingsHistory: _history, vacations: _vacations, rosters: _rosters, calculationHours: _hours, ...snapshot } = profile
  return structuredClone(snapshot)
}

export function journeyDateCount(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1)
}

export function journeyStageLabel(stage: WorkStage, today = toLocalDateValue()): string {
  if (stage.startDate > today) return '即将开始'
  if (!stage.endDate) return '当前工作'
  if (stage.endDate < today) return '已结束'
  return stage.endDate === today ? '今日最后任职' : `将于 ${stage.endDate.replaceAll('-', '.')} 结束`
}

export function journeyElapsedDays(stage: WorkStage, today = toLocalDateValue()): number {
  return journeyDateCount(stage.startDate, stage.endDate && stage.endDate < today ? stage.endDate : today)
}

export function validateWorkStage(stage: WorkStage, others: readonly WorkStage[], today = toLocalDateValue(new Date())): string | null {
  if (!stage.name.trim() || stage.name.length > 60) return '请填写 1–60 字的阶段名称。'
  if (!isSessionLocalDate(stage.startDate) || stage.startDate < '1900-01-01') return '请选择有效的开始日期（1900 年以后）。'
  if (stage.endDate !== null && (!isSessionLocalDate(stage.endDate) || stage.endDate < stage.startDate)) return '最后任职日不能早于开始日期。'
  if (others.some(other => other.id !== stage.id && stage.startDate <= (other.endDate ?? '9999-12-31') && other.startDate <= (stage.endDate ?? '9999-12-31'))) return '这段日期与已有工作重叠，请先结束当前工作或调整日期。'
  if ((stage.endDate === null || stage.endDate > today) && !stage.profile) return '未结束的工作需要填写薪资与工作安排。'
  if (stage.profile) {
    const p = stage.profile
    if (!Number.isFinite(p.salary) || p.salary < 0 || p.salary > 999999999) return '请输入有效薪资，0 表示无薪工作。'
    if (!Number.isFinite(p.monthlyWorkDays) || p.monthlyWorkDays <= 0 || p.monthlyWorkDays > 31) return '月计薪天数需大于 0 且不超过 31。'
    if (!Number.isFinite(p.workDaysPerWeek) || p.workDaysPerWeek < 1 || p.workDaysPerWeek > 7) return '每周工作天数需在 1–7 天之间。'
    if (getBreakPeriods(p).some(period => period.startTime === period.endTime)) return '休息开始与结束时间不能相同。'
    try { if (getPaidSecondsPerDay(p) <= 0 || !Number.isFinite(calculateRates(p).daily)) return '请设置有效的工作时间与休息时段。' } catch { return '请填写有效的工作与休息时间。' }
  }
  return null
}

export function newWorkStage(data: Pick<WorkStage, 'name' | 'company' | 'role' | 'startDate' | 'endDate' | 'profile'>): WorkStage {
  return { ...data, id: createId(), createdAt: new Date().toISOString(), profile: data.profile ? profileSnapshot(data.profile) : null }
}

export function journeyBlocker(): string | null {
  if (loadActiveSlacking()) return '还有摸鱼计时未结束，请到「摸鱼」完成结算后再调整工作阶段。'
  if (loadJSON<ActiveOvertime | null>(keys.activeOvertime, null)) return '还有加班计时未结束，请到「加班」完成结算后再调整工作阶段。'
  if (loadWorkRecords().some(record => record.status === 'working' || record.status === 'paused' || record.settlementPending)) return '还有工作计时或结算未完成，请到「今日」完成后再调整工作阶段。'
  return null
}

export function plansOutsideJourney(stages: readonly WorkStage[]) {
  return loadTimerPlans().filter(plan => ['scheduled', 'conflict'].includes(plan.status) && !stages.some(stage => {
    const date = toLocalDateValue(new Date(plan.startTime))
    return stage.startDate <= date && (!stage.endDate || date <= stage.endDate)
  }))
}

/** Profile and archived snapshots share one key. Serialize with the plan controller. */
export async function commitJourney(expected: SalaryProfile, stages: WorkStage[], cancelPlans = false): Promise<string | null> {
  const commit = () => {
    const current = loadProfile()
    if (profileFingerprint(current) !== profileFingerprint(expected)) return '工作或薪资设置已在其他页面更新，请关闭表单后重试。'
    for (const stage of stages) {
      const error = validateWorkStage(stage, stages)
      if (error) return error
    }
    const blocker = journeyBlocker()
    if (blocker) return blocker
    const affected = plansOutsideJourney(stages)
    if (affected.length && !cancelPlans) return `有 ${affected.length} 条预约落在工作日期之外，请确认取消这些预约。`
    const open = settingsWorkStage({ ...current, workJourney: { version: 1, revision: 0, stages } })
    const next: SalaryProfile = {
      ...current, ...(open?.profile ?? {}),
      // Living expenses belong to the person and continue through career gaps.
      livingCostHistory: current.livingCostHistory,
      workSettingsHistory: current.workSettingsHistory?.flatMap(change => {
        if (!current.workJourney && change.stageId === null) {
          const owner = [...stages].sort((a,b)=>a.startDate.localeCompare(b.startDate)).find(stage => stage.profile && (!stage.endDate || stage.endDate >= current.salaryEffectiveDate))
          return owner ? [{ ...change, stageId: owner.id }] : []
        }
        const before = current.workJourney?.stages.find(stage => stage.id === change.stageId)
        const after = stages.find(stage => stage.id === change.stageId)
        // Editing a job's payroll explicitly corrects that entire job. Metadata
        // and end-date edits preserve all dated raises and schedule changes.
        return before?.profile && after?.profile && profileFingerprint(workSettingsSnapshot(before.profile)) === profileFingerprint(workSettingsSnapshot(after.profile)) ? [change] : []
      }),
      rosters: current.rosters?.map(plan => !current.workJourney && plan.stageId === null ? { ...plan, stageId: [...stages].sort((a,b)=>a.startDate.localeCompare(b.startDate)).find(stage => stage.profile && (!stage.endDate || stage.endDate >= plan.effectiveFrom))?.id ?? null } : plan),
      vacations: current.vacations?.map(plan => !current.workJourney && plan.stageId === null ? { ...plan, stageId: stages.find(stage => stage.profile && stage.startDate <= plan.endDate && (!stage.endDate || stage.endDate >= plan.startDate))?.id ?? null } : plan),
      workJourney: { version: 1, revision: (current.workJourney?.revision ?? 0) + 1, stages: [...stages].sort((a, b) => b.startDate.localeCompare(a.startDate)) },
    }
    for(const roster of next.rosters??[]) {
      if(!next.workJourney?.stages.some(stage=>stage.id===roster.stageId && stage.profile)) continue
      const error=validateRoster(roster,next)
      if(error)return `排班需同步调整：${error}`
    }
    const previousPlans = loadTimerPlans()
    const ids = new Set(affected.map(plan => plan.id))
    const steps = affected.length ? [{
      write: () => saveJSON(TIMER_PLANS_KEY, previousPlans.map(plan => ids.has(plan.id) ? { ...plan, status: 'cancelled', message: '工作阶段已结束' } : plan)),
      rollback: () => { saveJSON(TIMER_PLANS_KEY, previousPlans) },
    }] : []
    steps.push({ write: () => saveJSON(keys.profile, next), rollback: () => { saveJSON(keys.profile, current) } })
    if (!runReversibleStorageTransaction(steps).success) return '保存失败，未完成本次修改。请释放浏览器存储空间后重试。'
    window.dispatchEvent(new Event(TIMER_PLANS_UPDATED))
    return null
  }
  return navigator.locks ? navigator.locks.request('money-dance-timer-plans', commit) : commit()
}

const JOURNEY_UNDO_KEY = 'money-dance:journey-deletion-undo'
interface JourneyDeletionReceipt {
  name: string
  changes: { key: string; before: unknown; after: unknown }[]
}
export function loadJourneyDeletionUndo() { return loadJSON<JourneyDeletionReceipt | null>(JOURNEY_UNDO_KEY, null) }

export function journeyDeletionImpact(profile: SalaryProfile, stage: WorkStage) {
  const remaining = profile.workJourney?.stages.filter(item => item.id !== stage.id) ?? []
  return {
    rosters: profile.rosters?.filter(item => item.stageId === stage.id).length ?? 0,
    vacations: profile.vacations?.filter(item => item.stageId === stage.id).length ?? 0,
    manualEntries: loadLedger().filter(item => item.workStageId === stage.id).length,
    plans: plansOutsideJourney(remaining).filter(item => {
      const date = toLocalDateValue(new Date(item.startTime))
      return date >= stage.startDate && (!stage.endDate || date <= stage.endDate)
    }),
  }
}

/** Remove a mistaken stage, not the underlying attendance, timers or manual money. */
export async function deleteWorkStage(expected: SalaryProfile, stageId: string): Promise<string | null> {
  const commit = () => {
    const current = loadProfile()
    if (profileFingerprint(current) !== profileFingerprint(expected)) return '工作设置已更新，请关闭后重新查看删除影响。'
    const stage = current.workJourney?.stages.find(item => item.id === stageId)
    if (!stage) return '这段工作已经不存在。'
    const blocker = journeyBlocker()
    if (blocker) return blocker
    const impact = journeyDeletionImpact(current, stage)
    const profile: SalaryProfile = { ...current,
      workJourney: { ...current.workJourney!, revision: current.workJourney!.revision + 1, stages: current.workJourney!.stages.filter(item => item.id !== stageId) },
      rosters: current.rosters?.filter(item => item.stageId !== stageId),
      vacations: current.vacations?.filter(item => item.stageId !== stageId),
      workSettingsHistory: current.workSettingsHistory?.filter(item => item.stageId !== stageId),
    }
    const ids = new Set(impact.plans.map(item => item.id))
    const changes: JourneyDeletionReceipt['changes'] = [{ key: keys.profile, before: loadJSON(keys.profile, {}), after: profile }]
    if (ids.size) changes.push({ key: TIMER_PLANS_KEY, before: loadTimerPlans(), after: loadTimerPlans().map(item => ids.has(item.id) ? { ...item, status: 'cancelled', message: '所属工作经历已删除' } : item) })
    if (impact.manualEntries) changes.push({ key: keys.ledger, before: loadLedger(), after: loadLedger().map(item => {
      if (item.workStageId !== stageId) return item
      const { workStageId: _stageId, ...entry } = item
      return entry
    }) })
    const previousUndo = loadJourneyDeletionUndo()
    const steps = changes.map(item => ({ write: () => saveJSON(item.key, item.after), rollback: () => { saveJSON(item.key, item.before) } }))
    steps.push({ write: () => saveJSON(JOURNEY_UNDO_KEY, { name: stage.name, changes }), rollback: () => { saveJSON(JOURNEY_UNDO_KEY, previousUndo) } })
    if (!runReversibleStorageTransaction(steps).success) return '删除未完成，请检查存储空间后重试。'
    window.dispatchEvent(new Event(TIMER_PLANS_UPDATED))
    return null
  }
  return navigator.locks ? navigator.locks.request('money-dance-timer-plans', commit) : commit()
}

export async function undoWorkStageDeletion(): Promise<string | null> {
  const commit = () => {
    const receipt = loadJourneyDeletionUndo()
    if (!receipt) return '没有可撤销的删除。'
    const blocker = journeyBlocker()
    if (blocker) return blocker
    if (receipt.changes.some(item => profileFingerprint(loadJSON(item.key, null)) !== profileFingerprint(item.after))) return '删除后相关设置、账目或预约已有新改动，无法直接撤销。新数据已保留，可通过补录经历恢复。'
    const steps = receipt.changes.map(item => ({
      write: () => saveJSON(item.key, item.key === TIMER_PLANS_KEY
        ? (item.before as TimerPlan[]).map(plan => ['scheduled', 'conflict'].includes(plan.status) && (item.after as TimerPlan[]).find(after => after.id === plan.id)?.status === 'cancelled' && +new Date(plan.startTime) <= Date.now()
          ? { ...plan, status: 'cancelled', message: '撤销删除时预约已过期，未重新启动' } : plan) : item.before),
      rollback: () => { saveJSON(item.key, item.after) },
    }))
    steps.push({ write: () => saveJSON(JOURNEY_UNDO_KEY, null), rollback: () => { saveJSON(JOURNEY_UNDO_KEY, receipt) } })
    if (!runReversibleStorageTransaction(steps).success) return '撤销未完成，请检查存储空间后重试。'
    window.dispatchEvent(new Event(TIMER_PLANS_UPDATED))
    return null
  }
  return navigator.locks ? navigator.locks.request('money-dance-timer-plans', commit) : commit()
}

export function stageSupplementalIncome(stageId: string) {
  return loadLedger().filter(entry => !entry.deleted && entry.direction === 'income' && entry.workStageId === stageId && entry.kind === 'manual')
}

export function stageDateImpact(previous: WorkStage, next: WorkStage) {
  const dates = new Set([...loadWorkRecords(), ...loadAttendanceRecords()].map(record => record.date))
  const contains = (stage: WorkStage, date: string) => stage.startDate <= date && (!stage.endDate || date <= stage.endDate)
  return [...dates].filter(date => contains(previous, date) !== contains(next, date)).length
}

export function stageDays(profile: SalaryProfile, stage: WorkStage, now = new Date()) {
  const last = (stage.endDate && stage.endDate < toLocalDateValue(now)) ? stage.endDate : toLocalDateValue(now)
  const start = toLocalDateTime(stage.startDate); start.setHours(0, 0, 0, 0)
  const end = toLocalDateTime(shiftSessionLocalDate(last, 1)); end.setHours(0, 0, 0, 0)
  const records = loadWorkRecords()
  const attendance = loadAttendanceRecords()
  const summary = summarizeLedger(profile, loadLedger(), start, end, now, records, attendance)
  const incomeByDate = new Map<string, number>()
  for (const entry of summary.entries) {
    if (entry.direction !== 'income' || !['salary', 'salary_override', 'overtime'].includes(entry.kind)) continue
    const date = summaryEntryDateValue(entry)
    incomeByDate.set(date, (incomeByDate.get(date) ?? 0) + entry.amount)
  }
  const rows: { date: string; seconds: number | null; amount: number | null; label: string; times: string }[] = []
  for (let date = stage.startDate; date <= last; date = shiftSessionLocalDate(date, 1)) {
    const seconds = stage.profile ? actualPaidIntervalsForDate(profile, date, now, records, attendance).reduce((sum, interval) => sum + Math.max(0, Math.min(now.getTime(), interval.end.getTime()) - interval.start.getTime()) / 1000, 0) : null
    const record = attendance.find(item => item.date === date)
    const workRecord = records.find(item => item.date === date)
    const dayShifts = rosterShiftsForDate(profile,date)
    const times = !workRecord?.sessions.length && dayShifts.length ? dayShifts.map(shift=>`${shift.startTime}–${shift.endDay?`+${shift.endDay}天 `:''}${shift.endTime}`).join(' / ') : !stage.profile ? '时间待补充' : workRecord?.sessions.length ? workRecord.sessions.map(session => {
      const start = new Date(session.startTime)
      const end = session.endTime ? new Date(session.endTime) : null
      return `${toLocalTimeValue(start)}–${end ? `${toLocalDateValue(end) > date ? `${toLocalDateValue(end)} ` : ''}${toLocalTimeValue(end)}` : '计时中'}`
    }).join(' / ') : seconds ? `${stage.profile.workStartTime}–${stage.profile.workEndTime < stage.profile.workStartTime ? '次日 ' : ''}${stage.profile.workEndTime}` : '—'
    const amount = incomeByDate.get(date) ?? (stage.profile ? 0 : null)
    rows.push({ date, seconds, amount, times, label: record?.status === 'leave' ? '请假' : record?.status === 'holiday' ? '假日' : seconds ? rosterDayLabel(profile,date) ?? '工作' : vacationForDate(profile, date)?.name ?? (!stage.profile ? '待补充' : '无工时') })
  }
  return rows.reverse()
}
