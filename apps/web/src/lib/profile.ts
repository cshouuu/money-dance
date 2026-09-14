import { rosterRateHours } from './roster'
import { DEFAULT_PROFILE, rosterForDate, vacationForDate, getBreakPeriods, parseClock, workProfileForDate, workStageForDate, type BreakPeriod, type LivingCostHistoryEvent, type LivingCostHistoryMode, type PaydayAdjustment, type SalaryDeduction, type SalaryProfile } from '@salary-flow/core'
import { getMonthlyPaidDayCount, getWeekStartDateValue, loadAttendanceRecords, loadChinaHolidaySettings, type ChinaHolidaySettings } from './attendance'
import { toLocalDateTime, toLocalDateValue } from './form'
import { keys, loadJSON, saveJSON } from './storage'
import type { WorkSettingsSnapshot } from '@salary-flow/core'
import { isSessionLocalDate } from './sessionBusinessDate'

/** Settings edit the active job, or the nearest upcoming job during a gap. */
export function settingsWorkStage(profile: SalaryProfile, date = toLocalDateValue()) {
  const active = workStageForDate(profile, date)
  return (active?.profile ? active : undefined) ?? profile.workJourney?.stages
    .filter(stage => stage.startDate > date && stage.profile)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
}

function settingsProfile(profile: SalaryProfile, date: string): SalaryProfile {
  const stage = settingsWorkStage(profile, date)
  const effective = stage && stage.startDate > date ? stage.startDate : date
  if (profile.workJourney && !stage?.profile) return profile
  return { ...profile, ...workProfileForDate(profile, effective), vacations: profile.vacations, rosters: profile.rosters, workJourney: profile.workJourney,
    includeLivingCost: profile.includeLivingCost, monthlyLivingCost: profile.monthlyLivingCost,
    livingCostMode: profile.livingCostMode, livingCostHistory: profile.livingCostHistory }
}

/** Apply a settings draft to its stage without changing the persisted journey revision. */
export function withSettingsStage(profile: SalaryProfile, date = toLocalDateValue()): SalaryProfile {
  if (!profile.workJourney) return profile
  const stage = settingsWorkStage(profile, date)
  const { workJourney, workSettingsHistory: _history, vacations: _vacations, rosters: _rosters, calculationHours: _hours, ...snapshot } = profile
  return { ...profile, workJourney: { ...workJourney,
    stages: workJourney.stages.map(item => item.id === stage?.id ? { ...item, profile: snapshot } : item) } }
}

export function normalizeBreakPeriods(profile: SalaryProfile): BreakPeriod[] {
  const periods = Array.isArray(profile.breakPeriods) ? profile.breakPeriods : getBreakPeriods({ ...profile, breakPeriods: undefined })
  return periods.flatMap((period, index) => {
    if (!period || typeof period !== 'object') return []
    try { parseClock(period.startTime); parseClock(period.endTime) } catch { return [] }
    return [{ id: typeof period.id === 'string' && period.id.trim() ? period.id : `break-${index + 1}`, name: typeof period.name === 'string' && period.name.trim() ? period.name.trim().slice(0, 30) : '休息', startTime: period.startTime, endTime: period.endTime }]
  })
}

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
  const stage = workStageForDate(profile, date)
  if (stage) attendanceRecords = attendanceRecords.filter(record => record.date >= stage.startDate && (!stage.endDate || record.date <= stage.endDate))
  // Personal living costs follow their dated history across work stages.
  const configuration = livingCostConfigurationForDate(profile, date)
  profile = workProfileForDate(profile, date)
  const datedProfile: SalaryProfile = {
    ...profile,
    includeLivingCost: configuration.mode !== 'off',
    livingCostMode: configuration.mode === 'daily-ledger' ? 'daily-ledger' : 'deduct',
    monthlyLivingCost: configuration.monthlyAmount,
  }
  const calculationHours = rosterRateHours(datedProfile, date)
  if (calculationHours) return { ...datedProfile, calculationHours }
  const monthPlans = profile.vacations?.filter(plan => {
    if (profile.workJourney ? plan.stageId !== stage?.id : plan.stageId !== null) return false
    const start = stage && stage.startDate > plan.startDate ? stage.startDate : plan.startDate
    const end = stage?.endDate && stage.endDate < plan.endDate ? stage.endDate : plan.endDate
    return start <= end && start.slice(0, 7) <= date.slice(0, 7) && end.slice(0, 7) >= date.slice(0, 7)
  }) ?? []
  const vacationMonth = monthPlans.length > 0
  if (vacationMonth) attendanceRecords = attendanceRecords.filter(record => !vacationForDate(profile, record.date))
  if (datedProfile.monthlyRateBasis !== 'actual-calendar' && !(vacationMonth && (['monthly', 'annual'].includes(profile.salaryType) || monthPlans.some(plan => plan.payMode === 'monthly')))) return datedProfile
  // A full-month denominator, with this job's dated workweek changes, keeps
  // a normal full month's salary constant when its schedule changes midmonth.
  const paidDays = getMonthlyPaidDayCount({ ...datedProfile, workJourney: undefined,
    workSettingsHistory: profile.workSettingsHistory?.filter(item => item.stageId === (stage?.id ?? null)).map(item => ({ ...item, stageId: null })),
  }, toLocalDateTime(date), attendanceRecords, holidaySettings)
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
  const stored = loadJSON<Partial<SalaryProfile>>(keys.profile, {})
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
    breakPeriods: normalizeBreakPeriods(profile),
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
  if (
    JSON.stringify(stored.breakPeriods) !== JSON.stringify(migrated.breakPeriods) ||
    storedHistoryMode !== migrated.salaryHistoryMode || storedPayday !== migrated.payday ||
    storedPaydayAdjustment !== migrated.paydayAdjustment || storedMonthlyRateBasis !== migrated.monthlyRateBasis ||
    JSON.stringify(storedSalaryDeductions) !== JSON.stringify(migrated.salaryDeductions) ||
    storedLivingCostMode !== migrated.livingCostMode ||
    JSON.stringify(storedLivingCostHistory) !== JSON.stringify(migrated.livingCostHistory) ||
    !stored.salaryEffectiveDate || !stored.defaultWorkMode || !stored.workWeekMode ||
    !stored.alternatingAnchorDate || !stored.alternatingAnchorType
  ) saveJSON(keys.profile, migrated)
  return settingsProfile(migrated, toLocalDateValue(now))
}

export function saveProfile(profile: SalaryProfile, now = new Date(), updateStage = true): SalaryProfile | null {
  const stored = loadJSON<Partial<SalaryProfile>>(keys.profile, {})
  // A stale settings tab may not overwrite a journey edited in another tab.
  if (profileFingerprint(stored.workJourney) !== profileFingerprint(profile.workJourney) || profileFingerprint(stored.vacations) !== profileFingerprint(profile.vacations) || profileFingerprint(stored.rosters) !== profileFingerprint(profile.rosters)) return null
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
    breakPeriods: normalizeBreakPeriods(profile),
    payday: normalizePayday(profile.payday),
    paydayAdjustment: normalizePaydayAdjustment(profile.paydayAdjustment, DEFAULT_PROFILE.paydayAdjustment),
    monthlyRateBasis: normalizeMonthlyRateBasis(profile.monthlyRateBasis, DEFAULT_PROFILE.monthlyRateBasis),
    salaryDeductions: normalizeSalaryDeductions(profile.salaryDeductions),
  }, now, previousConfiguration)
  if (next.workJourney && updateStage) {
    const updated = withSettingsStage(next, toLocalDateValue(now)).workJourney!
    next.workJourney = { ...updated, revision: updated.revision + 1 }
  } else if (next.workJourney) {
    const stage = settingsWorkStage(next, toLocalDateValue(now))
    next.workJourney = { ...next.workJourney, revision: next.workJourney.revision + 1,
      stages: next.workJourney.stages.map(item => item.id === stage?.id && item.profile
        ? { ...item, profile: { ...item.profile, salaryEffectiveDate: next.salaryEffectiveDate, salaryHistoryMode: next.salaryHistoryMode } } : item) }
  }
  return saveJSON(keys.profile, next) ? next : null
}

/** Only job rules are versioned here; personal expenses and ledger start are separate. */
export function workSettingsSnapshot(profile: SalaryProfile): WorkSettingsSnapshot {
  const { salary, salaryType, payday, paydayAdjustment, salaryDeductions, monthlyRateBasis, monthlyWorkDays,
    workDaysPerWeek, workWeekMode, alternatingAnchorDate, alternatingAnchorType, workStartTime, workEndTime,
    breakStartTime, breakEndTime, breakPeriods, paidBreak, defaultWorkMode } = profile
  return structuredClone({ salary, salaryType, payday, paydayAdjustment, salaryDeductions, monthlyRateBasis, monthlyWorkDays,
    workDaysPerWeek, workWeekMode, alternatingAnchorDate, alternatingAnchorType, workStartTime, workEndTime,
    breakStartTime, breakEndTime, breakPeriods, paidBreak, defaultWorkMode })
}

/** A revision replaces rules up to the next saved revision, never earlier dates. */
export function withDatedWorkSettings(previous: SalaryProfile, draft: SalaryProfile, effectiveFrom: string, now = new Date()): SalaryProfile {
  if (!isSessionLocalDate(effectiveFrom) || effectiveFrom < '1900-01-01') throw new Error('请选择有效的生效日期。')
  const stage = settingsWorkStage(previous, toLocalDateValue(now))
  if (previous.workJourney && !stage?.profile) throw new Error('当前没有可调整的工作，请先在工作旅程中建立工作。')
  if (stage && (effectiveFrom < stage.startDate || (stage.endDate && effectiveFrom > stage.endDate))) throw new Error('生效日期需要在这段工作的任职日期内。')
  const stageId = stage?.id ?? null
  const history = structuredClone(previous.workSettingsHistory ?? [])
  if (!history.some(item => item.stageId === stageId)) {
    history.push({ stageId, effectiveFrom: '1900-01-01', settings: workSettingsSnapshot(stage?.profile ?? previous) })
  }
  const nextHistory = history.filter(item => item.stageId !== stageId || item.effectiveFrom !== effectiveFrom)
  nextHistory.push({ stageId, effectiveFrom, settings: workSettingsSnapshot(draft) })
  let next: SalaryProfile = { ...draft, workJourney: previous.workJourney, workSettingsHistory: nextHistory.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)) }
  const previousCost = currentLivingCostConfiguration(previous)
  if (profileFingerprint(previousCost) !== profileFingerprint(currentLivingCostConfiguration(draft))) {
    if (!next.livingCostHistory.length) next.livingCostHistory = [{ version: 1, effectiveFrom: '1900-01-01', ...previousCost }]
    next = withLivingCostHistoryEvent(next, now, previousCost)
  }
  const dates = new Set([effectiveFrom, ...(next.rosters ?? []).filter(item => item.stageId === stageId && item.effectiveFrom > effectiveFrom).map(item => item.effectiveFrom)])
  for (const date of dates) {
    if (rosterForDate(next, date)?.pay.mode === 'salary' && !['monthly', 'annual'].includes(workProfileForDate(next, date).salaryType)) {
      throw new Error('排班正在沿用月薪或年薪。改为日薪或时薪前，请先在排班中调整基本工资的计薪方式。')
    }
  }
  return next
}

export function saveDatedProfile(expected: SalaryProfile, draft: SalaryProfile, effectiveFrom: string, now = new Date()): SalaryProfile | null {
  if (profileFingerprint(loadProfile(now)) !== profileFingerprint(expected)) return null
  const next = withDatedWorkSettings(expected, draft, effectiveFrom, now)
  const saved = saveProfile(next, now, false)
  return saved ? settingsProfile(saved, toLocalDateValue(now)) : null
}

/** Object key order is not a data change (normalization can reorder fields). */
export function profileFingerprint(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
    : entry)
}

export function recommendedMonthlyWorkDays(workDaysPerWeek: number): number {
  return Number(((workDaysPerWeek * 52) / 12).toFixed(2))
}

export const ALTERNATING_MONTHLY_WORK_DAYS = recommendedMonthlyWorkDays(5.5)
