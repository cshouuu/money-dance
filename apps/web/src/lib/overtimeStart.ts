import type { OvertimeStartOption } from '../types'
import { MAX_MONEY_AMOUNT } from './form'

export type OvertimeStartStep = 'pay-confirm' | 'pay-details'
export type OvertimePaidMode = 'multiplier' | 'fixed'

export type OvertimeStartSubmission =
  | { kind: 'show-pay-details' }
  | { kind: 'invalid'; message: string }
  | { kind: 'start'; option: OvertimeStartOption }

interface OvertimeStartSubmissionInput {
  step: OvertimeStartStep
  paidMode: OvertimePaidMode | null
  multiplier: number | null
  fixedAmount: number | null
}

/** Prevents the confirmation step or an unselected pay draft from starting a timer. */
export function resolveOvertimeStartSubmission(input: OvertimeStartSubmissionInput): OvertimeStartSubmission {
  if (input.step !== 'pay-details') return { kind: 'show-pay-details' }
  if (input.paidMode === null) return { kind: 'invalid', message: '请选择按工资倍率还是固定金额。' }

  if (input.paidMode === 'multiplier') {
    if (input.multiplier === null || !Number.isFinite(input.multiplier) || input.multiplier <= 0) {
      return { kind: 'invalid', message: '请输入有效的工资倍率。' }
    }
    return { kind: 'start', option: { payMode: 'multiplier', multiplier: input.multiplier } }
  }

  if (input.fixedAmount === null || !Number.isFinite(input.fixedAmount) || input.fixedAmount <= 0 || input.fixedAmount > MAX_MONEY_AMOUNT) {
    return { kind: 'invalid', message: '请输入有效的固定加班费。' }
  }
  return { kind: 'start', option: { payMode: 'fixed', fixedAmount: input.fixedAmount } }
}
