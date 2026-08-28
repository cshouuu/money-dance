import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
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
  }
  if (!stored.salaryHistoryMode || !stored.salaryEffectiveDate || !stored.defaultWorkMode) saveJSON(keys.profile, migrated)
  return migrated
}

export function saveProfile(profile: SalaryProfile): void { saveJSON(keys.profile, profile) }
