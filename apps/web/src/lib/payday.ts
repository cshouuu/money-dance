import type { PaydayAdjustment } from '@salary-flow/core'

export interface PaydayCountdown {
  daysRemaining: number
  nextPayday: Date
  nominalPayday: Date
  adjusted: boolean
}

export interface PaydayCountdownOptions {
  adjustment?: PaydayAdjustment
  isWorkday?: (date: Date) => boolean
}

const DAY_MS = 86_400_000

function calendarDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) / DAY_MS
}

function paydayForMonth(year: number, month: number, payday: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(payday, lastDay), 12, 0, 0, 0)
}

function adjustedPayday(value: Date, options: PaydayCountdownOptions): Date {
  const adjustment = options.adjustment ?? 'none'
  if (adjustment === 'none' || !options.isWorkday || options.isWorkday(value)) return value
  const direction = adjustment === 'previous-workday' ? -1 : 1
  const adjusted = new Date(value)
  for (let attempts = 0; attempts < 14; attempts += 1) {
    adjusted.setDate(adjusted.getDate() + direction)
    if (options.isWorkday(adjusted)) return adjusted
  }
  return value
}

/**
 * Resolves the next device-local payday by calendar date. For payday 29-31,
 * shorter months use their final calendar day instead of skipping a month.
 */
export function getPaydayCountdown(
  payday: number | null | undefined,
  now = new Date(),
  options: PaydayCountdownOptions = {},
): PaydayCountdown | null {
  if (!Number.isInteger(payday) || (payday ?? 0) < 1 || (payday ?? 0) > 31) return null

  const normalizedPayday = payday as number
  const today = calendarDay(now.getFullYear(), now.getMonth(), now.getDate())
  for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
    const nominalPayday = paydayForMonth(now.getFullYear(), now.getMonth() + monthOffset, normalizedPayday)
    const nextPayday = adjustedPayday(nominalPayday, options)
    const target = calendarDay(nextPayday.getFullYear(), nextPayday.getMonth(), nextPayday.getDate())
    if (target >= today) {
      return {
        daysRemaining: target - today,
        nextPayday,
        nominalPayday,
        adjusted: target !== calendarDay(nominalPayday.getFullYear(), nominalPayday.getMonth(), nominalPayday.getDate()),
      }
    }
  }
  return null
}
