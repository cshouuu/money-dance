import { keys, loadJSON } from './storage'

// Detect saved profiles, never a particular salary amount. Existing installations
// (including those using the old default salary) must not be reset by onboarding.
export function hasSavedProfile(): boolean {
  const value = loadJSON<unknown>(keys.profile, null)
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length)
}

export const TEST_BUILD = import.meta.env.VITE_TEST_BUILD === 'true'
