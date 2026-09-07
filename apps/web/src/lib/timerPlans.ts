import { calculateRates } from '@salary-flow/core'
import type { ActiveOvertime, ActiveSlacking, OvertimeStartOption, OvertimeSession, SlackingSession } from '../types'
import { keys, loadJSON, saveJSON } from './storage'
import { runReversibleStorageTransaction } from './storageTransaction'
import { createCompletedOvertimeSession, createOvertimeLedgerEntries, loadOvertimeSessions, overtimeIntervalsOverlap } from './overtime'
import { createCompletedSlackingSession, loadActiveSlacking, loadSlackingSessions } from './slacking'
import { loadProfile, salaryProfileForBusinessDate } from './profile'
import { loadAttendanceRecords } from './attendance'
import { loadWorkRecords } from './work'
import { calculatePaidTimeEarnings } from './paidTime'
import { loadLedger } from './ledger'
import { loadAchievementState, reconcileAchievementSessions, saveAchievementState } from './achievements'
import { resolveSessionStartBusinessDate } from './sessionBusinessDate'
import { createWebTimerSessionId, sameTimerStart } from './timerStop'

export type TimerPlanKind = 'slacking' | 'overtime'
export interface TimerPlan extends OvertimeStartOption {
  id: string
  kind: TimerPlanKind
  startTime: string
  endTime?: string
  status: 'scheduled' | 'running' | 'completed' | 'conflict' | 'cancelled'
  message?: string
}
export const TIMER_PLANS_KEY = 'salary-flow.timer-plans.v1'
export const TIMER_PLANS_UPDATED = 'money-dance:timer-plans-updated'
export const loadTimerPlans = (): TimerPlan[] => loadJSON<TimerPlan[]>(TIMER_PLANS_KEY, [])
const timestamp = (value: string) => new Date(value).getTime()

export function validateTimerPlan(plan: TimerPlan, plans: TimerPlan[], now = new Date()): string | null {
  if (!plan.id || !Number.isFinite(timestamp(plan.startTime)) || timestamp(plan.startTime) <= now.getTime()) return '请选择未来的开始日期与时间。'
  if (plan.endTime && (!Number.isFinite(timestamp(plan.endTime)) || timestamp(plan.endTime) <= timestamp(plan.startTime))) return '结束时间必须晚于开始时间。'
  if (plan.kind === 'overtime') {
    if (!['unpaid', 'multiplier', 'fixed'].includes(plan.payMode)) return '请选择加班费类型。'
    if (plan.payMode === 'multiplier' && (!Number.isFinite(plan.multiplier) || (plan.multiplier ?? 0) <= 0)) return '请输入大于 0 的工资倍率。'
    if (plan.payMode === 'fixed' && (!Number.isFinite(plan.fixedAmount) || (plan.fixedAmount ?? 0) <= 0 || plan.fixedAmount! > 999999999)) return '请输入有效的固定加班费。'
  }
  const conflict = plans.some(other => {
    if (other.id === plan.id || other.kind !== plan.kind || !['scheduled', 'running'].includes(other.status)) return false
    const [first, second] = timestamp(other.startTime) <= timestamp(plan.startTime) ? [other, plan] : [plan, other]
    return timestamp(first.startTime) === timestamp(second.startTime) || !!(first.endTime && timestamp(first.endTime) > timestamp(second.startTime))
  })
  return conflict ? '与同类预约时段重叠，请调整时间。' : null
}

export function saveTimerPlan(plan: TimerPlan, now = new Date()): string | null {
  const plans = loadTimerPlans()
  const existing = plans.find(item => item.id === plan.id)
  if (existing && !['scheduled', 'conflict'].includes(existing.status)) return '此计划已开始或结束，请刷新列表。'
  const error = validateTimerPlan(plan, plans, now)
  if (error) return error
  return saveJSON(TIMER_PLANS_KEY, [...plans.filter(item => item.id !== plan.id), { ...plan, status: 'scheduled', message: undefined }]) ? null : '预约保存失败，请释放存储空间后重试。'
}

export function cancelTimerPlan(id: string): boolean {
  const plans = loadTimerPlans()
  const plan = plans.find(item => item.id === id)
  if (!plan || !['scheduled', 'conflict'].includes(plan.status)) return false
  return saveJSON(TIMER_PLANS_KEY, plans.map(item => item.id === id ? { ...item, status: 'cancelled' } : item))
}

/** Synchronous reconciliation; the controller serializes across tabs with Web Locks. */
export function reconcileTimerPlans(now = new Date()): { changed: boolean; error: string | null } {
  let changed = false
  const due = loadTimerPlans().filter(plan => ['scheduled', 'running'].includes(plan.status) && timestamp(plan.startTime) <= now.getTime()).sort((a, b) => timestamp(a.startTime) - timestamp(b.startTime))
  for (const candidate of due) {
    const plans = loadTimerPlans()
    const plan = plans.find(item => item.id === candidate.id)!
    if (!['scheduled', 'running'].includes(plan.status)) continue
    const activeKey = plan.kind === 'slacking' ? keys.activeSlacking : keys.activeOvertime
    const sessionsKey = plan.kind === 'slacking' ? keys.sessions : keys.overtimeSessions
    const active = plan.kind === 'slacking' ? loadActiveSlacking() : loadJSON<ActiveOvertime | null>(activeKey, null)
    const sessions = plan.kind === 'slacking' ? loadSlackingSessions() : loadOvertimeSessions()
    const ownsActive = sameTimerStart(active?.startTime, plan.startTime)
    const completed = sessions.find(item => sameTimerStart(item.startTime, plan.startTime))
    const update = (status: TimerPlan['status'], message?: string) => plans.map(item => item.id === plan.id ? { ...item, status, message } : item)
    let nextPlans: TimerPlan[]
    let nextActive: ActiveSlacking | ActiveOvertime | null = active
    let nextSessions: (SlackingSession | OvertimeSession)[] | undefined
    let overtimeSession: OvertimeSession | undefined
    if (completed && plan.status === 'running') {
      nextPlans = update('completed')
      if (ownsActive) nextActive = null
    } else if (plan.status === 'running' && !ownsActive) {
      nextPlans = update('conflict', '原计时已变化，请检查记录后重新安排。')
    } else {
      const effectiveEnd = plan.endTime && timestamp(plan.endTime) <= now.getTime() ? plan.endTime : now.toISOString()
      const overlapsSession = sessions.some(item => overtimeIntervalsOverlap(plan.startTime, effectiveEnd, item.startTime, item.endTime))
      const overlapsActive = active && (!ownsActive || plan.status === 'scheduled') && (!plan.endTime || timestamp(plan.endTime) > timestamp(active.startTime))
      if (overlapsSession || overlapsActive) {
        nextPlans = update('conflict', '与已有或正在进行的同类记录冲突，预约未执行，请修改时间或取消。')
      } else if (plan.endTime && timestamp(plan.endTime) <= now.getTime()) {
        const metadata = resolveSessionStartBusinessDate(plan.startTime)!
        const input = { ...plan, ...metadata, id: createWebTimerSessionId(plan.kind, plan.startTime)!, endTime: plan.endTime }
        const profile = loadProfile(now)
        if (plan.kind === 'overtime') {
          const rate = calculateRates(salaryProfileForBusinessDate(profile, metadata.startLocalDate)).second
          const session = createCompletedOvertimeSession(input, rate)
          if (!session) return { changed, error: '预约计薪数据无效，请检查设置。' }
          overtimeSession = session
          nextSessions = [session, ...sessions.filter(item => item.id !== session.id)]
        } else {
          const calculation = calculatePaidTimeEarnings(profile, plan.startTime, plan.endTime, loadWorkRecords(), loadAttendanceRecords())
          const session = createCompletedSlackingSession(input, { paidDurationSeconds: calculation.paidSeconds, earnedAmount: calculation.earnedAmount })
          if (!session) return { changed, error: '预约时间无效，请检查设置。' }
          nextSessions = [session, ...sessions.filter(item => item.id !== session.id)]
        }
        nextPlans = update('completed')
        if (ownsActive) nextActive = null
      } else if (plan.status === 'scheduled') {
        nextActive = { ...resolveSessionStartBusinessDate(plan.startTime)!, startTime: plan.startTime, ...(plan.kind === 'overtime' ? { payMode: plan.payMode, multiplier: plan.multiplier, fixedAmount: plan.fixedAmount } : {}) }
        nextPlans = update('running')
      } else continue
    }
    const writes: { key: string; value: unknown }[] = []
    if (nextSessions) writes.push({ key: sessionsKey, value: nextSessions })
    if (overtimeSession) {
      const entries = createOvertimeLedgerEntries(overtimeSession, () => `plan-ledger-${plan.id}`)
      writes.push({ key: keys.ledger, value: [...entries, ...loadLedger().filter(entry => entry.kind !== 'overtime' || entry.linkedId !== overtimeSession!.id)] })
    }
    const previousAchievement = loadAchievementState(plan.kind)
    const steps = writes.map(write => {
      const previous = loadJSON<unknown>(write.key, [])
      return { write: () => saveJSON(write.key, write.value), rollback: () => { saveJSON(write.key, previous) } }
    })
    if (nextSessions) steps.push({ write: () => saveAchievementState(plan.kind, reconcileAchievementSessions(plan.kind, previousAchievement, nextSessions!, now.toISOString())), rollback: () => { saveAchievementState(plan.kind, previousAchievement) } })
    steps.push({ write: () => saveJSON(TIMER_PLANS_KEY, nextPlans), rollback: () => { saveJSON(TIMER_PLANS_KEY, plans) } })
    if (nextActive !== active) steps.push({ write: () => saveJSON(activeKey, nextActive), rollback: () => { saveJSON(activeKey, active) } })
    if (!runReversibleStorageTransaction(steps).success) return { changed, error: '预约执行暂时无法保存，将自动重试。' }
    changed = true
  }
  return { changed, error: null }
}
