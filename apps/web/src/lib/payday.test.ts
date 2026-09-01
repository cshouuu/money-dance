import { describe, expect, it } from 'vitest'
import { getPaydayCountdown } from './payday'

describe('getPaydayCountdown', () => {
  it('counts device-local calendar days until this month payday', () => {
    const countdown = getPaydayCountdown(10, new Date(2026, 8, 1, 23, 45))

    expect(countdown?.daysRemaining).toBe(9)
    expect(countdown?.nextPayday).toEqual(new Date(2026, 8, 10, 12))
  })

  it('reports zero throughout payday', () => {
    expect(getPaydayCountdown(10, new Date(2026, 8, 10, 23, 59))?.daysRemaining).toBe(0)
  })

  it('moves to next month after payday', () => {
    const countdown = getPaydayCountdown(10, new Date(2026, 8, 11, 8))

    expect(countdown?.daysRemaining).toBe(29)
    expect(countdown?.nextPayday).toEqual(new Date(2026, 9, 10, 12))
  })

  it('uses month end when payday does not exist in a shorter month', () => {
    expect(getPaydayCountdown(31, new Date(2027, 1, 27, 12))?.daysRemaining).toBe(1)
    expect(getPaydayCountdown(31, new Date(2027, 1, 28, 12))?.daysRemaining).toBe(0)
    expect(getPaydayCountdown(31, new Date(2028, 1, 28, 12))?.daysRemaining).toBe(1)
  })

  it.each([null, undefined, 0, 32, 1.5, Number.NaN])('rejects invalid payday %s', payday => {
    expect(getPaydayCountdown(payday)).toBeNull()
  })
})
