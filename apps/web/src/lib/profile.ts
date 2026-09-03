import { DEFAULT_PROFILE, type LivingCostHistoryEvent, type LivingCostHistoryMode, type PaydayAdjustment, type SalaryDeduction, type SalaryProfile } from '@salary-flow/core'
import { getMonthlyPaidDayCount, getWeekStartDateValue, loadAttendanceRecords, loadChinaHolidaySettings, type ChinaHolidaySettings } from './attendance'
import { toLocalDateTime, toLocalDateValue } from './form'
import { isStoredRecord, keys, loadJSON, saveJSON } from './storage'

export function normalizeLivingCostMode(value: unknown): SalaryProfile['livingCostMode'] {
  return value === 'daily-ledger' ? 'daily-ledger' : 'deduct'
}

export function normalizePayday(value: unknown): SalaryProfile['payday'] {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31 ? value : null
}

export function normalizePaydayAdjustment(value: unknown, fallback: PaydayAdjustment = 'none'): PaydayAdjustment {
  return value === 'previous-workday' || value === 'next-workday' || value === 'none' ? value : fallback
}

export function normalizeMonthlyRateBasis(value: unknown, fallback: SalaryProfile['monthlyRateBasis'] = 'average'): SalaryProfile['monthlyRateBasis'] {
  return value === 'actual-calendar' || value === 'average' ? value : fallback
}

export function normalizeSalaryDeductions(value: unknown): SalaryDeduction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const raw = candidate as Partial<SalaryDeduction>
    const type = raw.type === 'percentage' || raw.type === 'fixed' ? raw.type : null
    if (!type || typeof raw.value !== 'number' || !Number.isFinite(raw.value) || raw.value < 0) return []
    return [{
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `deduction-${index + 1}`,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 30) : `扣除项 ${index + 1}`,
      type,
      value: type === 'percentage' ? Math.min(100, raw.value) : raw.value,
      enabled: raw.enabled !== false,
    }]
  })
}

function normalizeLivingCostHistoryMode(value: unknown): LivingCostHistoryMode | null {
  return value === 'off' || value === 'deduct' || value === 'daily-ledger' ? value : null
}

export function normalizeLivingCostHistory(value: unknown): LivingCostHistoryEvent[] {
  if (!Array.isArray(value)) return []
  const byDate = new Map<string, LivingCostHistoryEvent>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Partial<LivingCostHistoryEvent>
    const mode = normalizeLivingCostHistoryMode(raw.mode)
    if (raw.version !== 1 || !mode || typeof raw.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveFrom)) continue
    if (typeof raw.monthlyAmount !== 'number' || !Number.isFinite(raw.monthlyAmount) || raw.monthlyAmount < 0) continue
    byDate.set(raw.effectiveFrom, {
      version: 1,
      effectiveFrom: raw.effectiveFrom,
      mode,
      monthlyAmount: raw.monthlyAmount,
    })
  }
  return [...byDate.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

export interface LivingCostConfiguration {
  mode: LivingCostHistoryMode
  monthlyAmount: number
}

function currentLivingCostConfiguration(profile: SalaryProfile): LivingCostConfiguration {
  return {
    mode: profile.includeLivingCost ? profile.livingCostMode : 'off',
    monthlyAmount: profile.monthlyLivingCost,
  }
}

/** Resolves the living-cost rules that belong to a device-local business date. */
export function livingCostConfigurationForDate(profile: SalaryProfile, date: string): LivingCostConfiguration {
  const history = normalizeLivingCostHistory(profile.livingCostHistory)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]!.effectiveFrom <= date) {
      return {
        mode: history[index]!.mode,
        monthlyAmount: history[index]!.monthlyAmount,
      }
    }
  }
  // The first persisted event is the compatibility baseline for older
  // business dates. daily-ledger/off are both gross salary configurations;
  // deduct retains the legacy net-rate calculation.
  if (history[0]) {
    return { mode: history[0].mode, monthlyAmount: history[0].monthlyAmount }
  }
  return currentLivingCostConfiguration(profile)
}

/** Returns the last explicitly recorded configuration before a business date. */
export function livingCostConfigurationBeforeDate(profile: SalaryProfile, date: string): LivingCostConfiguration | null {
  const history = normalizeLivingCostHistory(profile.livingCostHistory)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]!.effectiveFrom < date) {
      return {
        mode: history[index]!.mode,
        monthlyAmount: history[index]!.monthlyAmount,
      }
    }
  }
  return null
}

/** Returns the rate profile that was in force for a local business date. */
export function salaryProfileForBusinessDate(
  profile: SalaryProfile,
  date: string,
  attendanceRecords = loadAttendanceRecords(),
  holidaySettings: ChinaHolidaySettings = loadChinaHolidaySettings(toLocalDateTime(date)),
): SalaryProfile {
  const configuration = livingCostConfigurationForDate(profile, date)
  const datedProfile: SalaryProfile = {
    ...profile,
    includeLivingCost: configuration.mode !== 'off',
    livingCostMode: configuration.mode === 'daily-ledger' ? 'daily-ledger' : 'deduct',
    monthlyLivingCost: configuration.monthlyAmount,
  }
  if (datedProfile.monthlyRateBasis !== 'actual-calendar') return datedProfile
  const paidDays = getMonthlyPaidDayCount(datedProfile, toLocalDateTime(date), attendanceRecords, holidaySettings)
  return paidDays > 0 ? { ...datedProfile, monthlyWorkDays: paidDays } : datedProfile
}

function currentLivingCostEvent(profile: SalaryProfile, effectiveFrom: string): LivingCostHistoryEvent {
  return {
    version: 1,
    effectiveFrom,
    mode: profile.includeLivingCost ? profile.livingCostMode : 'off',
    monthlyAmount: profile.monthlyLivingCost,
  }
}

function previousLocalDateValue(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  previous.setDate(previous.getDate() - 1)
  return toLocalDateValue(previous)
}

function legacyBaselineDate(profile: SalaryProfile, now: Date): string {
  const today = toLocalDateValue(now)
  const configured = profile.salaryEffectiveDate
  if (/^\d{4}-\d{2}-\d{2}$/.test(configured) && configured < today) return configured
  return previousLocalDateValue(now)
}

function sameLivingCostConfiguration(a: LivingCostHistoryEvent, b: LivingCostHistoryEvent): boolean {
  return a.mode === b.mode && a.monthlyAmount === b.monthlyAmount
}

/**
 * Records a new living-cost configuration without rewriting prior days. Legacy
 * profiles stay history-free until daily-ledger is explicitly selected.
 */
export function withLivingCostHistoryEvent(
  profile: SalaryProfile,
  now = new Date(),
  previousConfiguration?: LivingCostConfiguration,
): SalaryProfile {
  const history = normalizeLivingCostHistory(profile.livingCostHistory)
  const nextEvent = currentLivingCostEvent(profile, toLocalDateValue(now))
  if (history.length === 0 && nextEvent.mode !== 'daily-ledger') return { ...profile, livingCostHistory: history }

  // Persist the pre-daily configuration as a compatibility baseline. Existing
  // users either had living costs deducted from salary or had them disabled;
  // both states must remain stable when daily-ledger is first selected.
  if (history.length === 0 && nextEvent.mode === 'daily-ledger' && previousConfiguration && previousConfiguration.mode !== 'daily-ledger') {
    history.push({
      version: 1,
      effectiveFrom: legacyBaselineDate(profile, now),
      mode: previousConfiguration.mode,
      monthlyAmount: previousConfiguration.monthlyAmount,
    })
  }

  const effectiveToday = [...history].reverse().find(event => event.effectiveFrom <= nextEvent.effectiveFrom)
  if (effectiveToday && sameLivingCostConfiguration(effectiveToday, nextEvent)) {
    return { ...profile, livingCostHistory: history }
  }

  const nextHistory = history.filter(event => event.effectiveFrom !== nextEvent.effectiveFrom)
  nextHistory.push(nextEvent)
  nextHistory.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return { ...profile, livingCostHistory: nextHistory }
}

export function normalizeSalaryHistoryMode(value: unknown): SalaryProfile['salaryHistoryMode'] {
  return value === 'custom' || value === 'month' || value === 'year' ? 'custom' : 'none'
}

export function loadProfile(now = new Date()): SalaryProfile {
  const loaded = loadJSON<unknown>(keys.profile, {})
  const stored = isStoredRecord(loaded) ? loaded as Partial<SalaryProfile> : {}
  const hasStoredProfile = Object.keys(stored).length > 0
  const profile = { ...DEFAULT_PROFILE, ...stored }
  const storedHistoryMode = (stored as { salaryHistoryMode?: unknown }).salaryHistoryMode
  const storedPayday = (stored as { payday?: unknown }).payday
  const storedLivingCostMode = (stored as { livingCostMode?: unknown }).livingCostMode
  const storedLivingCostHistory = (stored as { livingCostHistory?: unknown }).livingCostHistory
  const storedPaydayAdjustment = (stored as { paydayAdjustment?: unknown }).paydayAdjustment
  const storedMonthlyRateBasis = (stored as { monthlyRateBasis?: unknown }).monthlyRateBasis
  const storedSalaryDeductions = (stored as { salaryDeductions?: unknown }).salaryDeductions
  const normalizedLivingCostHistory = normalizeLivingCostHistory(storedLivingCostHistory)
  const normalizedSalaryDeductions = normalizeSalaryDeductions(storedSalaryDeductions)
  const migratedBase: SalaryProfile = {
    ...profile,
    payday: normalizePayday(storedPayday),
    paydayAdjustment: normalizePaydayAdjustment(storedPaydayAdjustment, hasStoredProfile ? 'none' : DEFAULT_PROFILE.paydayAdjustment),
    livingCostMode: normalizeLivingCostMode(storedLivingCostMode),
    livingCostHistory: normalizedLivingCostHistory,
    salaryDeductions: normalizedSalaryDeductions,
    monthlyRateBasis: normalizeMonthlyRateBasis(storedMonthlyRateBasis, hasStoredProfile ? 'average' : DEFAULT_PROFILE.monthlyRateBasis),
    salaryHistoryMode: normalizeSalaryHistoryMode(storedHistoryMode),
    salaryEffectiveDate: profile.salaryEffectiveDate || toLocalDateValue(now),
    defaultWorkMode: profile.defaultWorkMode ?? 'scheduled',
    workWeekMode: stored.workWeekMode ?? 'fixed',
    alternatingAnchorDate: stored.alternatingAnchorDate || getWeekStartDateValue(),
    alternatingAnchorType: stored.alternatingAnchorType ?? 'big',
  }
  // daily-ledger only existed on this unreleased branch before the history was
  // introduced, so migrating it from today cannot erase released user data.
  const migrated = normalizedLivingCostHistory.length === 0 && migratedBase.includeLivingCost && migratedBase.livingCostMode === 'daily-ledger'
    ? withLivingCostHistoryEvent(migratedBase, now)
    : migratedBase
  if (isStoredRecord(loaded) && (
    storedHistoryMode !== migrated.salaryHistoryMode || storedPayday !== migrated.payday ||
    storedPaydayAdjustment !== migrated.paydayAdjustment || storedMonthlyRateBasis !== migrated.monthlyRateBasis ||
    JSON.stringify(storedSalaryDeductions) !== JSON.stringify(migrated.salaryDeductions) ||
    storedLivingCostMode !== migrated.livingCostMode ||
    JSON.stringify(storedLivingCostHistory) !== JSON.stringify(migrated.livingCostHistory) ||
    !stored.salaryEffectiveDate || !stored.defaultWorkMode || !stored.workWeekMode ||
    !stored.alternatingAnchorDate || !stored.alternatingAnchorType
  )) saveJSON(keys.profile, migrated)
  return migrated
}

export function saveProfile(profile: SalaryProfile, now = new Date()): SalaryProfile | null {
  const loaded = loadJSON<unknown>(keys.profile, {})
  const stored = isStoredRecord(loaded) ? loaded as Partial<SalaryProfile> : {}
  const previousConfiguration: LivingCostConfiguration = {
    mode: (stored.includeLivingCost ?? DEFAULT_PROFILE.includeLivingCost)
      ? normalizeLivingCostMode(stored.livingCostMode)
      : 'off',
    monthlyAmount: typeof stored.monthlyLivingCost === 'number' && Number.isFinite(stored.monthlyLivingCost) && stored.monthlyLivingCost >= 0
      ? stored.monthlyLivingCost
      : DEFAULT_PROFILE.monthlyLivingCost,
  }
  const next = withLivingCostHistoryEvent({
    ...profile,
    payday: normalizePayday(profile.payday),
    paydayAdjustment: normalizePaydayAdjustment(profile.paydayAdjustment, DEFAULT_PROFILE.paydayAdjustment),
    monthlyRateBasis: normalizeMonthlyRateBasis(profile.monthlyRateBasis, DEFAULT_PROFILE.monthlyRateBasis),
    salaryDeductions: normalizeSalaryDeductions(profile.salaryDeductions),
  }, now, previousConfiguration)
  return saveJSON(keys.profile, next) ? next : null
}

export function recommendedMonthlyWorkDays(workDaysPerWeek: number): number {
  return Number(((workDaysPerWeek * 52) / 12).toFixed(2))
}

export const ALTERNATING_MONTHLY_WORK_DAYS = recommendedMonthlyWorkDays(5.5)
