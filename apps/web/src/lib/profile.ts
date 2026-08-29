import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { getWeekStartDateValue } from './attendance'
import { toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'

export function loadProfile(): SalaryProfile {
  const stored = loadJSON<Partial<SalaryProfile>>(keys.profile, {})
  const profile = { ...DEFAULT_PROFILE, ...stored }
  const migrated = {
    ...profile,
    salaryHistoryMode: profile.salaryHistoryMode ?? 'none',
    salaryEffectiveDate: profile.salaryEffectiveDate || toLocalDateValue(),
    defaultWorkMode: profile.defaultWorkMode ?? 'scheduled',
    workWeekMode: stored.workWeekMode ?? 'fixed',
    alternatingAnchorDate: stored.alternatingAnchorDate || getWeekStartDateValue(),
    alternatingAnchorType: stored.alternatingAnchorType ?? 'big',
  }
  if (!stored.salaryHistoryMode || !stored.salaryEffectiveDate || !stored.defaultWorkMode || !stored.workWeekMode || !stored.alternatingAnchorDate || !stored.alternatingAnchorType) saveJSON(keys.profile, migrated)
  return migrated
}

export function saveProfile(profile: SalaryProfile): void { saveJSON(keys.profile, profile) }

export function recommendedMonthlyWorkDays(workDaysPerWeek: number): number {
  return Number(((workDaysPerWeek * 52) / 12).toFixed(2))
}

export const ALTERNATING_MONTHLY_WORK_DAYS = recommendedMonthlyWorkDays(5.5)
