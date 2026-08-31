export interface WishItem {
  id: string
  name: string
  price: number
  createdAt: string
  purchasedAt?: string
}

export interface SlackingSession {
  id: string
  startTime: string
  /** Business date captured in the device timezone when the session began. */
  startLocalDate?: string
  /** Date#getTimezoneOffset captured at the session start instant. */
  startTimezoneOffsetMinutes?: number
  endTime: string
  durationSeconds: number
  earnedAmount: number
}

export interface ActiveSlacking {
  startTime: string
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
}

export type OvertimePayMode = 'unpaid' | 'multiplier' | 'fixed'

export interface OvertimeStartOption {
  payMode: OvertimePayMode
  multiplier?: number
  fixedAmount?: number
}

export interface ActiveOvertime extends OvertimeStartOption {
  startTime: string
  /** Captured before travel so the completed session keeps its original day. */
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
}

export interface OvertimeSegment {
  startTime: string
  endTime: string
}

export interface OvertimeSession extends ActiveOvertime {
  id: string
  endTime: string
  durationSeconds: number
  earnedAmount: number
  /**
   * Optional paid-working slices for sessions derived from flexible work.
   * Ordinary overtime timers are continuous and omit this field.
   */
  segments?: OvertimeSegment[]
}

export type DailyWorkStatus = 'ready' | 'working' | 'paused' | 'ended'
export type FlexibleWorkSettlementMode = 'actual' | 'full-day'

export interface WorkSession {
  id: string
  startTime: string
  endTime?: string
}

export interface DailyWorkRecord {
  date: string
  mode: 'scheduled' | 'flexible'
  status: DailyWorkStatus
  sessions: WorkSession[]
  settlementMode?: FlexibleWorkSettlementMode
  /** Version 2 records explicitly support full-target settlement for hourly salaries. */
  settlementVersion?: 2
  /** New ended records remain frozen until the user chooses their settlement. */
  settlementPending?: boolean
  /** Stable link for an overtime record generated from excess flexible work. */
  overtimeSessionId?: string
  /** Optional one-off automatic stop selected when flexible work starts. */
  plannedEndTime?: string
  updatedAt: string
}

export type AttendanceStatus = 'normal' | 'leave' | 'holiday'
export type LeaveType = 'personal' | 'sick' | 'annual' | 'compensatory' | 'marriage' | 'maternity' | 'prenatal' | 'paternity' | 'parental' | 'bereavement' | 'remote'
export type AttendancePayMode = 'unpaid' | 'multiplier' | 'fixed'
export type AttendanceLeavePeriod = 'full-day' | 'morning' | 'afternoon'

export interface AttendanceRecord {
  date: string
  status: AttendanceStatus
  leaveType?: LeaveType
  /** Missing on legacy records means a full-day leave. */
  leavePeriod?: AttendanceLeavePeriod
  payMode?: AttendancePayMode
  multiplier?: number
  fixedAmount?: number
  updatedAt: string
}

export interface OwnedItem {
  id: string
  name: string
  price: number
  purchaseDate: string
  category: string
  createdAt: string
}

export type LedgerDirection = 'income' | 'expense'
export type LedgerKind = 'purchase' | 'accident' | 'manual' | 'salary_override' | 'overtime'

export interface LedgerEntry {
  id: string
  kind: LedgerKind
  direction: LedgerDirection
  amount: number
  source: string
  occurredAt: string
  /** Stable local business date for entries created from a date-only choice. */
  localDate?: string
  /** Whether a salary override already has living costs deducted from it. */
  livingCostDeducted?: boolean
  linkedId?: string
  note?: string
  replacesId?: string
  deleted?: boolean
}
