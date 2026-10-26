import { validateBackupData } from '../backupSchema'
import { DEFAULT_PROFILE, type SalaryProfile } from '@salary-flow/core'
import { hasSavedSalaryProfile, loadProfile, profileFingerprint, withDatedWorkSettings } from '../profile'
import { loadAttendanceRecords, loadChinaHolidaySettings, saveChinaHolidaySettings } from '../attendance'
import { loadWorkRecords } from '../work'
import { loadLedger } from '../ledger'
import { loadOvertimeSessions } from '../overtime'
import { loadSlackingSessions } from '../slacking'
import { keys, saveJSON } from '../storage'
import { createId } from '../id'
import { isSessionLocalDate } from '../sessionBusinessDate'
import { emptyWorkspaceStore, PRIMARY_SPACE_ID, SPACE_TEMPLATES, WORKSPACES_KEY, templateForProfile, type SpaceTemplate, type WorkSpace, type WorkspaceStore } from './model'
import { toLocalDateValue } from '../form'
import { prepareTemplateChange, validateTemplateProfile } from './templates'

export function loadWorkspaceStore(): WorkspaceStore {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(WORKSPACES_KEY)
  if (!raw) return emptyWorkspaceStore()
  const value = JSON.parse(raw) as WorkspaceStore
  if (value.version !== 1 || !Array.isArray(value.spaces)) throw new Error('工作空间数据无法读取，请保留备份后检查。')
  validateBackupData({ [WORKSPACES_KEY]: value })
  return value
}

export function primarySpace(): WorkSpace {
  const profile = loadProfile()
  return { id: PRIMARY_SPACE_ID, name: loadWorkspaceStore().primaryName, template: templateForProfile(profile, toLocalDateValue()), createdAt: '',
    profile, holidaySettings: loadChinaHolidaySettings(), workRecords: loadWorkRecords(),
    attendanceRecords: loadAttendanceRecords(), ledger: loadLedger(), overtime: loadOvertimeSessions(), slacking: loadSlackingSessions() }
}
export function loadSpaces(): WorkSpace[] { return [primarySpace(), ...loadWorkspaceStore().spaces] }

/** First launch may create the initial journey and roster. Ordinary settings
 * cannot use this path to overwrite a configured profile. Save profile last. */
export function initializePrimarySpace(space: WorkSpace): void {
  if (hasSavedSalaryProfile()) throw new Error('主业已在其他页面完成设置，请刷新后查看。')
  validateBackupData({ [keys.profile]: JSON.parse(JSON.stringify(space.profile)) })
  const store = loadWorkspaceStore()
  if (!saveJSON(WORKSPACES_KEY, { ...store, primaryName: space.name, revision: store.revision + 1 })) throw new Error('空间名称未保存，请检查设备存储空间。')
  if (!saveChinaHolidaySettings(space.holidaySettings)) throw new Error('节假日设置未保存，请检查设备存储空间。')
  if (!saveJSON(keys.profile, space.profile)) throw new Error('工资设置未保存，请检查设备存储空间后重试。')
}

/** The lock covers the whole container. Compare inside it, then commit with a
 * single atomic localStorage write so a stale editor never loses another space. */
export async function commitWorkspaces(expected: WorkspaceStore, change: (current: WorkspaceStore) => WorkspaceStore): Promise<void> {
  const commit = () => {
    const current = loadWorkspaceStore()
    if (profileFingerprint(current) !== profileFingerprint(expected)) throw new Error('空间数据已更新，请重新打开后再保存；当前草稿仍保留。')
    const next = change(structuredClone(current))
    next.revision = current.revision + 1
    const persisted = JSON.parse(JSON.stringify(next)) as WorkspaceStore
    validateBackupData({ [WORKSPACES_KEY]: persisted })
    if (!saveJSON(WORKSPACES_KEY, persisted)) throw new Error('保存失败，请释放设备存储空间后重试。')
  }
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('money-dance-workspaces', commit)
  else commit()
}

export type SpaceSetupRules = Pick<SalaryProfile, 'workStartTime' | 'workEndTime' | 'breakPeriods' | 'paidBreak' | 'workDaysPerWeek' | 'payday' | 'monthlyIncomeTarget'>

export function newSpace(name: string, templateId: SpaceTemplate, salary: number, effectiveFrom: string, rules?: SpaceSetupRules): WorkSpace {
  if (!name.trim() || name.trim().length > 40) throw new Error('空间名称需为 1–40 字。')
  if (!Number.isFinite(salary) || salary < 0 || salary > 999999999) throw new Error('请填写有效的非负工资金额。')
  if (!isSessionLocalDate(effectiveFrom) || effectiveFrom < '1900-01-01') throw new Error('请选择有效的开始日期。')
  const template = SPACE_TEMPLATES.find(item => item.id === templateId)
  if (!template) throw new Error('请选择工作方式。')
  const profile: SalaryProfile = { ...structuredClone(DEFAULT_PROFILE), ...rules, workTemplate: templateId, salary, salaryType: template.salaryType,
    defaultWorkMode: template.mode, salaryEffectiveDate: effectiveFrom, salaryHistoryMode: 'custom',
    includeLivingCost: false, livingCostHistory: [], monthlyLivingCost: 0, salaryDeductions: [],
    ...(template.salaryType === 'hourly' ? { workDaysPerWeek: 7, paidBreak: true, breakPeriods: [] } : {}) }
  profile.monthlyWorkDays = Number((profile.workDaysPerWeek * 52 / 12).toFixed(2))
  validateTemplateProfile(profile)
  // A real employment boundary prevents manual records from generating income
  // before this space existed. Different spaces have separate journeys.
  const stageId = createId()
  profile.workJourney = { version: 1, revision: 0, stages: [{ id: stageId, name: name.trim(), company: '', role: template.name,
    startDate: effectiveFrom, endDate: null, profile: structuredClone(profile), createdAt: new Date().toISOString() }] }
  if (templateId === 'nurse' || templateId === 'factory') {
    profile.rosters = [{ id: createId(), stageId, effectiveFrom, enabled: true, mode: templateId === 'factory' ? 'cycle' : 'manual', anchorDate: effectiveFrom,
      templates: [], cycle: [[]], overrides: [], respectVacations: true, respectHolidays: false,
      pay: { mode: 'salary', value: 0, basis: 'planned', monthlyHours: 0, overtime: 'manual', overtimeValue: 1.5, preserveMonthlySalary: true } }]
  }
  return { id: createId(), name: name.trim(), template: templateId, createdAt: new Date().toISOString(), profile,
    holidaySettings: { ...loadChinaHolidaySettings(), enabled: templateId === 'fixed', effectiveFrom },
    workRecords: [], attendanceRecords: [], ledger: [], overtime: [], slacking: [] }
}

export function reviseSpace(space: WorkSpace, draft: SalaryProfile, effectiveFrom: string): WorkSpace {
  if (space.archivedOn) throw new Error('归档空间保留历史，不能修改计薪规则。')
  if (space.workRecords.some(record => ['working', 'paused'].includes(record.status) || record.settlementPending)) throw new Error('请先结束该空间的工作计时并结算，再修改规则。')
  validateTemplateProfile(draft)
  return { ...space, profile: withDatedWorkSettings(space.profile, prepareTemplateChange(space.profile, draft, effectiveFrom), effectiveFrom) }
}

export function replaceSpace(store: WorkspaceStore, next: WorkSpace): WorkspaceStore {
  if (!store.spaces.some(space => space.id === next.id)) throw new Error('工作空间不存在，请重新打开。')
  return { ...store, spaces: store.spaces.map(space => space.id === next.id ? next : space) }
}
