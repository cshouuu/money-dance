import { keys } from './storage'

type Check = (value: unknown) => boolean
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str: Check = v => typeof v === 'string' && v.length <= 20000
const id: Check = v => str(v) && (v as string).length > 0
const num: Check = v => typeof v === 'number' && Number.isFinite(v)
const positive: Check = v => num(v) && (v as number) >= 0
const bool: Check = v => typeof v === 'boolean'
const one = (...values: unknown[]): Check => v => values.includes(v)
const nullable = (check: Check): Check => v => v === null || check(v)
const array = (check: Check): Check => v => Array.isArray(v) && v.length <= 100000 && v.every(check)
const fields = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => v => obj(v)
  && Object.entries(required).every(([key, check]) => Object.hasOwn(v, key) && check(v[key]))
  && Object.entries(optional).every(([key, check]) => !Object.hasOwn(v, key) || check(v[key]))
const map = (check: Check): Check => v => obj(v) && Object.values(v).every(check)
const time: Check = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const date: Check = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const clock: Check = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
const unique = (check: Check, key = 'id'): Check => v => array(check)(v)
  && new Set((v as Record<string, unknown>[]).map(item => item[key])).size === (v as unknown[]).length
const optionalDate: Check = v => v === '' || date(v)
const sessionDates = { startLocalDate: date, startTimezoneOffsetMinutes: num }
const pay = { payMode: one('unpaid', 'multiplier', 'fixed'), multiplier: positive, fixedAmount: positive }
const interval = fields({ startTime: time, endTime: time })
const wish = fields({ id, name: v => id(v) && (v as string).trim().length > 0 && (v as string).length <= 60, price: positive, createdAt: time }, { startedAt: time, purchasedAt: time })
const wishes = unique(wish)
const deduction = fields({ id, name: str, type: one('fixed', 'percentage'), value: positive, enabled: bool })
const breakPeriod = fields({ id, name: str, startTime: clock, endTime: clock })
const shift = fields({ id, name: str, color: str, startTime: clock, endTime: clock, endDay: positive,
  breaks: array(fields({ id, name: str, startMinute: positive, endMinute: positive, paid: bool })), amount: positive, allowance: positive })
const roster = fields({ id, stageId: nullable(id), effectiveFrom: date, enabled: bool, mode: one('manual', 'weekly', 'cycle'), anchorDate: date,
  templates: unique(shift), cycle: array(array(id)), overrides: array(fields({ date, shifts: array(shift), reason: str }, { amount: positive, keepVacationPay: bool })),
  respectVacations: bool, respectHolidays: bool,
  pay: fields({ mode: one('salary', 'hourly', 'shift'), value: positive, basis: one('planned', 'actual'), monthlyHours: positive, overtime: one('manual', 'unpaid', 'multiplier', 'fixed'), overtimeValue: positive }, { preserveMonthlySalary: bool }) })
const profileFields: Record<string, Check> = {
  salary: positive, salaryType: one('monthly', 'annual', 'daily', 'hourly'), payday: nullable(v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31),
  paydayAdjustment: one('none', 'previous-workday', 'next-workday'), workStartTime: clock, workEndTime: clock, breakStartTime: clock, breakEndTime: clock,
  paidBreak: bool, breakPeriods: array(breakPeriod), includeLivingCost: bool, monthlyLivingCost: positive,
  livingCostMode: one('deduct', 'daily-ledger'), livingCostHistory: array(fields({ version: one(1), effectiveFrom: date, mode: one('off', 'deduct', 'daily-ledger'), monthlyAmount: positive })),
  salaryDeductions: array(deduction), monthlyRateBasis: one('average', 'actual-calendar'), monthlyWorkDays: v => positive(v) && (v as number) > 0,
  workDaysPerWeek: v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7,
  workWeekMode: one('fixed', 'alternating'), alternatingAnchorDate: date, alternatingAnchorType: one('big', 'small'), currency: str,
  salaryHistoryMode: one('none', 'custom', 'month', 'year'), salaryEffectiveDate: optionalDate, defaultWorkMode: one('scheduled', 'flexible'),
  calculationHours: fields({ day: positive, month: positive }, { hourly: positive, monthlyAmount: positive, salaryDayAmount: positive }),
  rosters: array(roster), vacations: array(fields({ id, stageId: nullable(id), name: str, kind: one('winter', 'summer', 'custom'), startDate: date, endDate: date, payMode: one('normal', 'ratio', 'monthly', 'unpaid'), value: positive })),
}
const profile: Check = v => fields({ salary: positive, salaryType: profileFields.salaryType }, profileFields)(v)
profileFields.workSettingsHistory = array(fields({ stageId: nullable(id), effectiveFrom: date, settings: profile }))
profileFields.workJourney = fields({ version: one(1), revision: positive, stages: unique(fields({ id, name: str, company: str, role: str, startDate: date, endDate: nullable(date), profile: nullable(profile), createdAt: time })) })
const achievementState = fields({ lifetimeSeconds: positive, processedSessionIds: array(id), highestLevel: positive, unlockedAt: map(time) }, { creditedSecondsBySessionId: map(positive) })

export const HOLIDAY_KEY = 'money-dance.china-holiday-calendar.v1'
export const PLANS_KEY = 'salary-flow.timer-plans.v1'
export const THEME_KEY = 'salary-flow.theme.v1'
export const UNDO_KEY = 'money-dance:journey-deletion-undo'
const labels: Record<string, string> = {
  [keys.profile]: '工资与历史设置', [keys.wishes]: '心愿', [keys.wishAllocation]: '心愿分配历史',
  [keys.widgetWishes]: '桌面心愿选择', [keys.mobileDock]: '移动导航栏', [keys.sessions]: '摸鱼记录',
  [keys.overtimeSessions]: '加班记录', [keys.achievements]: '成就', [keys.assets]: '物品',
  [keys.ledger]: '账本', [keys.workRecords]: '工作记录', [keys.attendanceRecords]: '出勤记录',
  [HOLIDAY_KEY]: '节假日设置', [THEME_KEY]: '主题', [PLANS_KEY]: '计时预约',
}
export const BACKUP_CHECKS: Record<string, Check> = {
  [keys.profile]: profile,
  [keys.wishes]: wishes,
  [keys.wishAllocation]: nullable(fields({ version: one(1), adoptedAt: time, initial: wishes, revisions: array(fields({ at: time, items: wishes })) })),
  [keys.widgetWishes]: array(str), [keys.mobileDock]: array(str),
  [keys.sessions]: unique(fields({ id, startTime: time, endTime: time, durationSeconds: positive, earnedAmount: positive }, { ...sessionDates, paidDurationSeconds: positive })),
  [keys.overtimeSessions]: unique(fields({ id, startTime: time, endTime: time, durationSeconds: positive, earnedAmount: positive, payMode: pay.payMode }, { ...sessionDates, multiplier: positive, fixedAmount: positive, segments: array(interval) })),
  [keys.achievements]: fields({ version: one(1), slacking: achievementState, overtime: achievementState }),
  [keys.assets]: unique(fields({ id, name: str, price: positive, purchaseDate: time, category: str, createdAt: time })),
  [keys.ledger]: unique(fields({ id, kind: one('purchase', 'accident', 'manual', 'salary_override', 'overtime'), direction: one('income', 'expense'), amount: positive, source: str, occurredAt: time },
    { workStageId: str, localDate: date, livingCostDeducted: bool, linkedId: str, note: str, replacesId: str, deleted: bool })),
  [keys.workRecords]: unique(fields({ date, mode: one('scheduled', 'flexible'), status: one('ready', 'working', 'paused', 'ended'), sessions: unique(fields({ id, startTime: time }, { endTime: time })), updatedAt: time },
    { settlementMode: one('actual', 'full-day'), settlementVersion: one(2), settlementPending: bool, overtimeSessionId: str, plannedEndTime: time }), 'date'),
  [keys.attendanceRecords]: unique(fields({ date, status: one('normal', 'leave', 'holiday'), updatedAt: time },
    { leaveType: one('personal', 'sick', 'annual', 'compensatory', 'marriage', 'maternity', 'prenatal', 'paternity', 'parental', 'bereavement', 'remote'), leavePeriod: one('full-day', 'morning', 'afternoon'), ...pay }), 'date'),
  [HOLIDAY_KEY]: fields({ enabled: bool, effectiveFrom: date, dataVersion: str }),
  [THEME_KEY]: str,
  [PLANS_KEY]: unique(fields({ id, kind: one('slacking', 'overtime'), startTime: time, status: one('scheduled', 'running', 'completed', 'conflict', 'cancelled') }, { endTime: time, message: str, ...pay })),
}

/** Validate the whole tree before using dynamic keys or recursive profile rules. */
export function assertSafeTree(value: unknown) {
  let nodes = 0
  function walk(v: unknown, depth: number) {
    if (++nodes > 250000 || depth > 32) throw new Error('备份内容过大或层级过深。')
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('备份包含无效数字。')
    if (!v || typeof v !== 'object') return
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('备份包含不支持的字段。')
      walk(child, depth + 1)
    }
  }
  walk(value, 0)
}

export function validateBackupData(value: unknown): asserts value is Record<string, unknown> {
  assertSafeTree(value)
  if (!obj(value)) throw new Error('备份的数据部分无效。')
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(BACKUP_CHECKS, key)) throw new Error('备份包含当前版本不支持的数据，请更新应用后再试。')
    if (!BACKUP_CHECKS[key](item)) throw new Error(`备份中的「${labels[key]}」数据格式不正确，未导入任何数据。`)
  }
  const plan = value[keys.wishAllocation] as { adoptedAt: string; initial: unknown[]; revisions: { at: string; items: unknown[] }[] } | undefined
  if (plan) {
    let previous = plan.adoptedAt
    for (const revision of plan.revisions) {
      if (Date.parse(revision.at) < Date.parse(previous)) throw new Error('心愿分配历史顺序不正确。')
      previous = revision.at
    }
    if (JSON.stringify(plan.revisions.at(-1)?.items ?? plan.initial) !== JSON.stringify(value[keys.wishes] ?? [])) throw new Error('心愿清单和分配历史不一致，请在原设备重新导出。')
  }
}
