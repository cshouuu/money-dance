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
  endTime: string
  durationSeconds: number
  earnedAmount: number
}

export type OvertimePayMode = 'unpaid' | 'multiplier' | 'fixed'

export interface OvertimeStartOption {
  payMode: OvertimePayMode
  multiplier?: number
  fixedAmount?: number
}

export interface ActiveOvertime extends OvertimeStartOption {
  startTime: string
}

export interface OvertimeSession extends ActiveOvertime {
  id: string
  endTime: string
  durationSeconds: number
  earnedAmount: number
}

export type DailyWorkStatus = 'ready' | 'working' | 'paused' | 'ended'

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
  updatedAt: string
}

export type AttendanceStatus = 'normal' | 'leave' | 'holiday'
export type LeaveType = 'personal' | 'sick' | 'annual' | 'compensatory' | 'marriage' | 'maternity' | 'prenatal' | 'paternity' | 'parental' | 'bereavement' | 'remote'
export type AttendancePayMode = 'unpaid' | 'multiplier' | 'fixed'

export interface AttendanceRecord {
  date: string
  status: AttendanceStatus
  leaveType?: LeaveType
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
  linkedId?: string
  note?: string
  replacesId?: string
  deleted?: boolean
}
