import { vacationForDate, type SalaryProfile, type VacationPlan, type WorkStage } from '@salary-flow/core'
import { loadAttendanceRecords } from './attendance'
import { toLocalDateValue } from './form'
import { loadLedger } from './ledger'
import { getMonthlyWorkStats } from './monthlyStats'
import { loadProfile, profileFingerprint } from './profile'
import { isSessionLocalDate, shiftSessionLocalDate } from './sessionBusinessDate'
import { keys, saveJSON } from './storage'
import { loadWorkRecords } from './work'

export function vacationPayLabel(plan: VacationPlan): string {
  return plan.payMode === 'normal' ? '工资照常' : plan.payMode === 'unpaid' ? '不计薪'
    : plan.payMode === 'ratio' ? `工资 ${Math.round(plan.value * 100)}%` : `假期月薪 ¥${plan.value.toLocaleString('zh-CN')}`
}

export function vacationRange(plan: VacationPlan, stage?: WorkStage) {
  const start = stage && stage.startDate > plan.startDate ? stage.startDate : plan.startDate
  const end = stage?.endDate && stage.endDate < plan.endDate ? stage.endDate : plan.endDate
  return { start, end, active: start <= end, clipped: start !== plan.startDate || end !== plan.endDate }
}

export function upcomingVacations(profile: SalaryProfile, today: string) {
  return (profile.vacations ?? []).flatMap(plan => {
    const stage = profile.workJourney?.stages.find(item => item.id === plan.stageId)
    const range = vacationRange(plan, stage)
    if (!range.active || range.start <= today || vacationForDate(profile, range.start)?.id !== plan.id) return []
    return [{ plan, ...range }]
  }).sort((a, b) => a.start.localeCompare(b.start))
}

export function validateVacation(plan: VacationPlan, profile: SalaryProfile): string | null {
  if (!plan.name.trim() || plan.name.length > 40) return '请填写 1–40 字的假期名称。'
  if (!['winter', 'summer', 'custom'].includes(plan.kind) || !['normal', 'ratio', 'monthly', 'unpaid'].includes(plan.payMode)) return '请选择有效的假期与计薪方式。'
  if (!isSessionLocalDate(plan.startDate) || !isSessionLocalDate(plan.endDate) || plan.startDate < '1900-01-01' || plan.endDate < plan.startDate) return '请选择有效的起止日期，结束日期不能早于开始日期。'
  if ((Date.parse(plan.endDate) - Date.parse(plan.startDate)) / 86400000 >= 366) return '单段假期最多 366 天，可以分段设置。'
  if (!Number.isFinite(plan.value) || (plan.payMode === 'ratio' && (plan.value < 0 || plan.value > 1)) || (plan.payMode === 'monthly' && (plan.value < 0 || plan.value > 999999999))) return '请填写有效比例（0–100%）或假期月薪。'
  if (profile.workJourney) {
    const stage = profile.workJourney.stages.find(item => item.id === plan.stageId)
    if (!stage?.profile) return '请选择已填写薪资的工作阶段。'
    if (plan.startDate < stage.startDate || (stage.endDate && plan.endDate > stage.endDate)) return '假期需在该工作阶段的任职日期内；可以先在工作旅程中调整任职日期。'
  } else if (plan.stageId !== null) return '请选择当前工作。'
  if (profile.vacations?.some(item => item.id !== plan.id && item.stageId === plan.stageId && item.startDate <= plan.endDate && plan.startDate <= item.endDate)) return '这段日期与该工作已有假期重叠，请调整日期。'
  return null
}

export async function saveVacations(expected: SalaryProfile, plans: VacationPlan[]): Promise<string | null> {
  const commit = () => {
    const current = loadProfile()
    if (profileFingerprint(current) !== profileFingerprint(expected)) return '工作、薪资或假期已在其他页面更新，请重新打开后预览。'
    // Existing clipped plans remain as history; only changed plans need validation.
    for (const plan of plans) {
      if (profileFingerprint(plan) === profileFingerprint(current.vacations?.find(item => item.id === plan.id))) continue
      const error = validateVacation(plan, { ...current, vacations: plans })
      if (error) return error
    }
    return saveJSON(keys.profile, { ...current, vacations: plans }) ? null : '保存失败，请检查浏览器存储空间后重试。'
  }
  return navigator.locks ? navigator.locks.request('money-dance-timer-plans', commit) : commit()
}

export function vacationImpact(profile: SalaryProfile, plans: VacationPlan[], changed: VacationPlan[]) {
  const records = loadWorkRecords()
  const attendance = loadAttendanceRecords()
  const ledger = loadLedger()
  const months = new Set<string>()
  for (const plan of changed) {
    for (let date = plan.startDate; date <= plan.endDate; date = shiftSessionLocalDate(date, 1)) months.add(date.slice(0, 7))
  }
  const next = { ...profile, vacations: plans }
  const rows = [...months].sort().map(month => {
    const [year, value] = month.split('-').map(Number)
    const end = new Date(year, value, 0, 23, 59, 59)
    return { month, before: getMonthlyWorkStats(profile, ledger, records, attendance, end).expectedIncome, after: getMonthlyWorkStats(next, ledger, records, attendance, end).expectedIncome }
  })
  const dates = new Set([...records, ...attendance].filter(record => changed.some(plan => plan.startDate <= record.date && record.date <= plan.endDate)).map(record => record.date))
  return { rows, preservedDays: dates.size, historical: changed.some(plan => plan.startDate < toLocalDateValue()) }
}

export function stageVacationSummary(profile: SalaryProfile, stage: WorkStage, today: string): string | null {
  const current = vacationForDate(profile, today)
  if (current?.stageId === stage.id) return `${current.name}中 · 在职`
  const next = upcomingVacations(profile, today).find(item => item.plan.stageId === stage.id)
  return next ? `${next.start} 起 ${next.plan.name}` : null
}
