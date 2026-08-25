import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { keys, loadJSON, saveJSON } from './storage'

export function loadProfile(): SalaryProfile { return loadJSON(keys.profile, DEFAULT_PROFILE) }
export function saveProfile(profile: SalaryProfile): void { saveJSON(keys.profile, profile) }
