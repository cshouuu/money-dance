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

  it('moves a non-working payday to the previous workday', () => {
    const countdown = getPaydayCountdown(6, new Date(2026, 8, 1, 12), {
      adjustment: 'previous-workday',
      isWorkday: date => date.getDay() !== 0 && date.getDay() !== 6,
    })

    expect(countdown?.nominalPayday).toEqual(new Date(2026, 8, 6, 12))
    expect(countdown?.nextPayday).toEqual(new Date(2026, 8, 4, 12))
    expect(countdown?.daysRemaining).toBe(3)
    expect(countdown?.adjusted).toBe(true)
  })

  it('skips an already-passed early payday when its nominal date is still ahead', () => {
    const countdown = getPaydayCountdown(6, new Date(2026, 8, 5, 12), {
      adjustment: 'previous-workday',
      isWorkday: date => date.getDay() !== 0 && date.getDay() !== 6,
    })

    expect(countdown?.nominalPayday).toEqual(new Date(2026, 9, 6, 12))
    expect(countdown?.nextPayday).toEqual(new Date(2026, 9, 6, 12))
  })

  it('can move a non-working payday to the next workday', () => {
    const countdown = getPaydayCountdown(6, new Date(2026, 8, 1, 12), {
      adjustment: 'next-workday',
      isWorkday: date => date.getDay() !== 0 && date.getDay() !== 6,
    })
    expect(countdown?.nextPayday).toEqual(new Date(2026, 8, 7, 12))
  })

  it.each([null, undefined, 0, 32, 1.5, Number.NaN])('rejects invalid payday %s', payday => {
    expect(getPaydayCountdown(payday)).toBeNull()
  })
})
