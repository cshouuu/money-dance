export interface PaydayCountdown {
  daysRemaining: number
  nextPayday: Date
}

const DAY_MS = 86_400_000

function calendarDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) / DAY_MS
}

function paydayForMonth(year: number, month: number, payday: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(payday, lastDay), 12, 0, 0, 0)
}

/**
 * Resolves the next device-local payday by calendar date. For payday 29-31,
 * shorter months use their final calendar day instead of skipping a month.
 */
export function getPaydayCountdown(payday: number | null | undefined, now = new Date()): PaydayCountdown | null {
  if (!Number.isInteger(payday) || (payday ?? 0) < 1 || (payday ?? 0) > 31) return null

  const normalizedPayday = payday as number
  const today = calendarDay(now.getFullYear(), now.getMonth(), now.getDate())
  let nextPayday = paydayForMonth(now.getFullYear(), now.getMonth(), normalizedPayday)
  let target = calendarDay(nextPayday.getFullYear(), nextPayday.getMonth(), nextPayday.getDate())

  if (target < today) {
    nextPayday = paydayForMonth(now.getFullYear(), now.getMonth() + 1, normalizedPayday)
    target = calendarDay(nextPayday.getFullYear(), nextPayday.getMonth(), nextPayday.getDate())
  }

  return { daysRemaining: target - today, nextPayday }
}
