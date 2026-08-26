import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { keys, loadJSON, saveJSON } from './storage'

export function loadProfile(): SalaryProfile {
  const stored = loadJSON<Partial<SalaryProfile>>(keys.profile, {})
  return { ...DEFAULT_PROFILE, ...stored }
}

export function saveProfile(profile: SalaryProfile): void { saveJSON(keys.profile, profile) }
