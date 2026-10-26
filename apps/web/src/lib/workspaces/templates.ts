import { calculateRates, getBreakPeriods, rosterForDate, workProfileForDate, type SalaryProfile, type RosterPlan } from '@salary-flow/core'
import { createId } from '../id'
import { settingsWorkStage } from '../profile'
import { templateFeatures, type SpaceTemplate } from './model'

/** Apply only work rules. Earnings, records, costs and other spaces are untouched. */
export function applyWorkTemplate(profile: SalaryProfile, template: SpaceTemplate, date: string): SalaryProfile {
  const features = templateFeatures(template)
  const next: SalaryProfile = {
    ...profile, workTemplate: template,
    defaultWorkMode: features.fixedHours || features.roster ? 'scheduled' : 'flexible',
    salaryType: features.hourly ? 'hourly' : profile.salaryType === 'hourly' ? 'monthly' : profile.salaryType,
    ...(features.hourly ? { paidBreak: true, breakPeriods: [], workDaysPerWeek: 7 } : {}),
  }
  const stageId = settingsWorkStage(profile, date)?.id ?? null
  const existing = rosterForDate(profile, date)
  if (features.roster || existing) {
    const plan: RosterPlan = existing ? {
      ...structuredClone(existing), id: createId(), effectiveFrom: date,
      enabled: features.roster, mode: template === 'factory' ? 'cycle' : existing.mode,
      overrides: existing.overrides.filter(item => item.date >= date),
    } : {
      id: createId(), stageId, effectiveFrom: date, enabled: true,
      mode: template === 'factory' ? 'cycle' : 'manual', anchorDate: date,
      templates: [], cycle: [[]], overrides: [], respectVacations: true, respectHolidays: false,
      pay: { mode: 'salary', value: 0, basis: 'planned', monthlyHours: 0, overtime: 'manual', overtimeValue: 1.5, preserveMonthlySalary: true },
    }
    next.rosters = [...(profile.rosters ?? []).filter(item => item.stageId !== stageId || item.effectiveFrom !== date), plan]
    // A temporary change must stop at the next already-saved work rule, just as salary does.
    const following = profile.workSettingsHistory?.filter(item => item.stageId === stageId && item.effectiveFrom > date)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]
    if (following && !next.rosters.some(item => item.stageId === stageId && item.effectiveFrom > date && item.effectiveFrom <= following.effectiveFrom)) {
      const restore = rosterForDate(profile, following.effectiveFrom)
      next.rosters.push({ ...structuredClone(restore ?? plan), id: createId(), effectiveFrom: following.effectiveFrom, enabled: !!restore,
        overrides: (restore?.overrides ?? []).filter(item => item.date >= following.effectiveFrom) })
    }
  }
  return next
}

export function validateTemplateProfile(profile: SalaryProfile): void {
  if (profile.monthlyIncomeTarget !== undefined && (!Number.isFinite(profile.monthlyIncomeTarget) || profile.monthlyIncomeTarget < 0 || profile.monthlyIncomeTarget > 999999999)) throw new Error('请填写有效的月收入目标。')
  if (!Number.isFinite(profile.salary) || profile.salary < 0 || profile.salary > 999999999) throw new Error('请填写有效的工资金额。')
  if (profile.payday !== null && (!Number.isInteger(profile.payday) || profile.payday < 1 || profile.payday > 31)) throw new Error('发薪日需为 1–31 日。')
  if (!Number.isInteger(profile.workDaysPerWeek) || profile.workDaysPerWeek < 1 || profile.workDaysPerWeek > 7) throw new Error('每周工作天数需为 1–7 天。')
  if (getBreakPeriods(profile).some(period => !period.name.trim() || period.startTime === period.endTime)) throw new Error('请检查休息时段。')
  calculateRates(profile)
}

export function templateAtDate(profile: SalaryProfile, fallback: SpaceTemplate, date: string) {
  return workProfileForDate(profile, date).workTemplate ?? fallback
}

export function prepareTemplateChange(original: SalaryProfile, draft: SalaryProfile, date: string): SalaryProfile {
  if (!draft.workTemplate || draft.workTemplate === workProfileForDate(original, date).workTemplate) return draft
  return applyWorkTemplate({ ...draft, rosters: original.rosters, workJourney: original.workJourney,
    workSettingsHistory: original.workSettingsHistory }, draft.workTemplate, date)
}
