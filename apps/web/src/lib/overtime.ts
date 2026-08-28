import type { ActiveOvertime } from '../types'

export const OVERTIME_MULTIPLIERS = [1, 1.5, 2, 3, 4, 5] as const

export function calculateOvertimeEarnings(option: Pick<ActiveOvertime, 'payMode' | 'multiplier' | 'fixedAmount'>, durationSeconds: number, secondRate: number): number {
  if (option.payMode === 'unpaid') return 0
  if (option.payMode === 'fixed') return Math.max(0, option.fixedAmount ?? 0)
  return Math.max(0, durationSeconds) * Math.max(0, secondRate) * Math.max(0, option.multiplier ?? 1)
}

export function overtimePayLabel(option: Pick<ActiveOvertime, 'payMode' | 'multiplier' | 'fixedAmount'>): string {
  if (option.payMode === 'unpaid') return '无加班费'
  if (option.payMode === 'fixed') return `固定 ¥${(option.fixedAmount ?? 0).toFixed(2)}`
  return `${option.multiplier ?? 1} 倍工资`
}
