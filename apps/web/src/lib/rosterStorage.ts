import { rosterForDate, rosterShiftsForDate, type SalaryProfile, type RosterPlan, type ShiftTemplate } from '@salary-flow/core'
import { MAX_SHIFT_DAYS, shiftDuration } from './roster'
import { isSessionLocalDate, shiftSessionLocalDate } from './sessionBusinessDate'
import { localDateWithTime } from './form'
import { loadProfile, profileFingerprint } from './profile'
import { keys, saveJSON } from './storage'

export function validateShift(shift: ShiftTemplate): string | null {
  if (!shift.id || !shift.name.trim() || shift.name.length > 40) return '班次名称需为 1–40 字。'
  let duration: number
  try { duration = shiftDuration(shift) } catch { return '请填写有效的班次时间。' }
  if (!Number.isInteger(shift.endDay) || shift.endDay < 0 || shift.endDay > MAX_SHIFT_DAYS || duration <= 0 || duration > MAX_SHIFT_DAYS * 86400) return '结束时间需晚于开始，单班最多 31 天。24 小时班次请选择次日结束。'
  if (![shift.amount, shift.allowance].every(value => Number.isFinite(value) && value >= 0 && value <= 999999999)) return '班次工资与补贴需为有效的非负金额。'
  let last = 0
  for (const rest of [...shift.breaks].sort((a, b) => a.startMinute - b.startMinute)) {
    if (!rest.name.trim() || !Number.isFinite(rest.startMinute) || !Number.isFinite(rest.endMinute) || rest.startMinute < last || rest.endMinute <= rest.startMinute || rest.endMinute * 60 > duration) return '休息时段需在班次内且互不重叠，结束时间需晚于开始。'
    last = rest.endMinute
  }
  if (shift.breaks.filter(item => !item.paid).reduce((sum, item) => sum + (item.endMinute - item.startMinute) * 60, 0) >= duration) return '请至少保留一段计薪工时；休息日可直接设为休息。'
  return null
}

export function validateRoster(plan: RosterPlan, profile: SalaryProfile): string | null {
  if (!plan.id || !isSessionLocalDate(plan.effectiveFrom) || !isSessionLocalDate(plan.anchorDate) || plan.effectiveFrom < '1900-01-01') return '请选择有效的生效日期与循环起点。'
  if (profile.workJourney ? !profile.workJourney.stages.some(stage => stage.id === plan.stageId && stage.profile) : plan.stageId !== null) return '请选择已填写薪资的工作阶段。'
  if (!['manual', 'weekly', 'cycle'].includes(plan.mode)) return '请选择排班方式。'
  if (!plan.cycle.length || plan.cycle.length > 366 || (plan.mode === 'weekly' && plan.cycle.length !== 7)) return '循环需为 1–366 天，按周重复需设置 7 天。'
  if (new Set(plan.templates.map(item => item.id)).size !== plan.templates.length) return '班次标识重复。'
  for (const shift of [...plan.templates, ...plan.overrides.flatMap(item => item.shifts)]) { const error = validateShift(shift); if (error) return error }
  if (plan.cycle.some(day => new Set(day).size !== day.length || day.some(id => !plan.templates.some(shift => shift.id === id)))) return '循环中存在重复或已删除的班次。'
  if (!['salary','hourly','shift'].includes(plan.pay.mode) || !['planned','actual'].includes(plan.pay.basis) || !['manual','unpaid','multiplier','fixed'].includes(plan.pay.overtime) || ![plan.pay.value, plan.pay.monthlyHours, plan.pay.overtimeValue].every(value => Number.isFinite(value) && value >= 0 && value <= 999999999)) return '请填写有效的计薪方式、单价与标准工时。'
  if (plan.enabled && plan.pay.mode === 'salary') {
    const salaryType = profile.workJourney?.stages.find(stage => stage.id === plan.stageId)?.profile?.salaryType ?? profile.salaryType
    if (!['monthly','annual'].includes(salaryType)) return '固定工资模式需要先设置月薪或年薪，也可选择按小时或按班计薪。'
  }
  if (new Set(plan.overrides.map(item => item.date)).size !== plan.overrides.length) return '同一天只能有一条单日调整。'
  for (const override of plan.overrides) {
    if (!isSessionLocalDate(override.date) || override.date < plan.effectiveFrom || (override.amount !== undefined && (!Number.isFinite(override.amount) || override.amount < 0 || override.amount > 999999999))) return '单日调整日期或金额无效。'
  }
  // Check the cycle seam, adjacent versions, and every exceptional date.
  const dates = new Set<string>()
  const anchors = [...new Set([
    plan.effectiveFrom, plan.anchorDate, ...plan.overrides.map(item => item.date),
    ...(profile.rosters ?? []).flatMap(item => [item.effectiveFrom, ...item.overrides.map(day => day.date)]),
    ...(profile.workJourney?.stages ?? []).flatMap(stage => [stage.startDate, ...(stage.endDate ? [shiftSessionLocalDate(stage.endDate, 1)] : [])]),
  ])]
  for (const anchor of anchors) for (let offset = -MAX_SHIFT_DAYS; offset <= plan.cycle.length * 2 + MAX_SHIFT_DAYS; offset++) dates.add(shiftSessionLocalDate(anchor, offset))
  const spans = [...dates].flatMap(date => rosterShiftsForDate(profile, date).map(shift => ({ start: +localDateWithTime(date, shift.startTime), end: +localDateWithTime(date, shift.startTime) + shiftDuration(shift) * 1000, date, name: shift.name }))).sort((a, b) => a.start - b.start)
  let end = -Infinity
  for (const span of spans) { if (span.start < end) return `${span.date}「${span.name}」与其他班次重叠，请调整班次或休息日。`; end = Math.max(end, span.end) }
  return null
}

export async function saveRosterPlans(expected: SalaryProfile, plans: RosterPlan[]): Promise<string | null> {
  const commit = () => {
    const current = loadProfile()
    if (profileFingerprint(current) !== profileFingerprint(expected)) return '设置已在其他页面更新，请重新打开排班设置。'
    const next = { ...current, rosters: plans }
    for (const plan of plans) {
      if (profileFingerprint(current.rosters?.find(item => item.id === plan.id)) === profileFingerprint(plan)) continue
      const error = validateRoster(plan, next)
      if (error) return error
    }
    return saveJSON(keys.profile, next) ? null : '保存失败，请释放存储空间后重试；草稿仍保留。'
  }
  try { return navigator.locks ? await navigator.locks.request('money-dance-timer-plans', commit) : commit() } catch { return '暂时无法保存，请重试。' }
}
