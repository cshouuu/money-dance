import { describe, expect, it } from 'vitest'
import { resolveOvertimeStartSubmission } from './overtimeStart'

describe('resolveOvertimeStartSubmission', () => {
  it('never starts the default 1.5x option from the confirmation step', () => {
    expect(resolveOvertimeStartSubmission({
      step: 'pay-confirm',
      paidMode: 'multiplier',
      multiplier: 1.5,
      fixedAmount: null,
    })).toEqual({ kind: 'show-pay-details' })
  })

  it('requires an explicit pay mode and multiplier input', () => {
    expect(resolveOvertimeStartSubmission({
      step: 'pay-details',
      paidMode: null,
      multiplier: null,
      fixedAmount: null,
    }).kind).toBe('invalid')
    expect(resolveOvertimeStartSubmission({
      step: 'pay-details',
      paidMode: 'multiplier',
      multiplier: null,
      fixedAmount: null,
    }).kind).toBe('invalid')
  })

  it('accepts a user-entered decimal multiplier', () => {
    expect(resolveOvertimeStartSubmission({
      step: 'pay-details',
      paidMode: 'multiplier',
      multiplier: 2.35,
      fixedAmount: null,
    })).toEqual({ kind: 'start', option: { payMode: 'multiplier', multiplier: 2.35 } })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid multiplier %s', multiplier => {
    expect(resolveOvertimeStartSubmission({
      step: 'pay-details',
      paidMode: 'multiplier',
      multiplier,
      fixedAmount: null,
    }).kind).toBe('invalid')
  })

  it('accepts an explicitly entered fixed amount', () => {
    expect(resolveOvertimeStartSubmission({
      step: 'pay-details',
      paidMode: 'fixed',
      multiplier: null,
      fixedAmount: 88,
    })).toEqual({ kind: 'start', option: { payMode: 'fixed', fixedAmount: 88 } })
  })
})
