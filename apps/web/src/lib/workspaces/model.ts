import { rosterForDate, workProfileForDate, type SalaryProfile, type WorkTemplate } from '@salary-flow/core'
import type { ChinaHolidaySettings } from '../attendance'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry, OvertimeSession, SlackingSession } from '../../types'

export const WORKSPACES_KEY = 'money-dance.workspaces.v1'
export const PRIMARY_SPACE_ID = 'primary'
export const SPACE_TEMPLATES = [
  { id: 'fixed', name: '固定上下班', description: '月薪、双休与法定节假日', mode: 'scheduled', salaryType: 'monthly' },
  { id: 'nurse', name: '护理与排班', description: '手动排班、跨日班次与补贴', mode: 'scheduled', salaryType: 'monthly' },
  { id: 'factory', name: '工厂轮班', description: '三班倒、四班倒与循环排班', mode: 'scheduled', salaryType: 'monthly' },
  { id: 'sales', name: '弹性工作', description: '弹性出勤，按实际工时记录', mode: 'flexible', salaryType: 'monthly' },
  { id: 'freelance', name: '自由接单', description: '实际小时计薪，项目款记入公共账本', mode: 'flexible', salaryType: 'hourly' },
  { id: 'parttime', name: '小时兼职', description: '做多久算多久，不自动补足整天', mode: 'flexible', salaryType: 'hourly' },
] as const
export type SpaceTemplate = WorkTemplate

/** Existing users keep their actual rules; a missing preset is inferred read-only. */
export function templateForProfile(profile: SalaryProfile, date: string): SpaceTemplate {
  const config = workProfileForDate(profile, date)
  if (config.workTemplate) return config.workTemplate
  const roster = rosterForDate(profile, date)
  if (roster) return roster.mode === 'cycle' ? 'factory' : 'nurse'
  return config.defaultWorkMode === 'flexible' ? config.salaryType === 'hourly' ? 'freelance' : 'sales' : 'fixed'
}

export function templateFeatures(template: SpaceTemplate) {
  return {
    roster: template === 'nurse' || template === 'factory',
    fixedHours: template === 'fixed',
    hourly: template === 'freelance' || template === 'parttime',
    overtime: template !== 'freelance' && template !== 'parttime' && template !== 'sales',
  }
}

/** Primary data stays in its existing keys; every reader resolves this stable
 * identity explicitly. No data is swapped when a user opens a different space. */
export interface WorkSpace {
  id: string
  name: string
  template: SpaceTemplate
  createdAt: string
  archivedOn?: string
  profile: SalaryProfile
  holidaySettings: ChinaHolidaySettings
  workRecords: DailyWorkRecord[]
  attendanceRecords: AttendanceRecord[]
  ledger: LedgerEntry[]
  overtime: OvertimeSession[]
  slacking: SlackingSession[]
}
export interface WorkspaceStore {
  version: 1
  revision: number
  primaryName: string
  spaces: WorkSpace[]
}
export const emptyWorkspaceStore = (): WorkspaceStore => ({ version: 1, revision: 0, primaryName: '我的主业', spaces: [] })
