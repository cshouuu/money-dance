import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, assetCostPerHour, calculateRates, getWorkedPaidSeconds, priceToWorkSeconds, slackingEarned } from './index.js'

describe('salary calculations', () => {
  it('calculates an 8-hour paid work day after unpaid lunch', () => {
    const rates = calculateRates(DEFAULT_PROFILE)
    expect(rates.paidSecondsPerDay).toBe(8 * 3600)
    expect(rates.daily).toBeCloseTo(15000 / 21.75, 8)
  })

  it('subtracts monthly living cost before deriving rates', () => {
    const rates = calculateRates({ ...DEFAULT_PROFILE, includeLivingCost: true, monthlyLivingCost: 3000 })
    expect(rates.daily).toBeCloseTo((15000 - 3000) / 21.75, 8)
    expect(rates.hourly).toBeCloseTo(((15000 - 3000) / 21.75) / 8, 8)
  })

  it('never returns negative disposable rates when living cost exceeds income', () => {
    const rates = calculateRates({ ...DEFAULT_PROFILE, includeLivingCost: true, monthlyLivingCost: 20000 })
    expect(rates.daily).toBe(0)
    expect(rates.second).toBe(0)
  })

  it('does not count unpaid lunch as worked time', () => {
    const now = new Date(2026, 7, 25, 12, 30, 0)
    expect(getWorkedPaidSeconds(DEFAULT_PROFILE, now)).toBe(3 * 3600)
  })

  it('caps earnings after work ends', () => {
    const now = new Date(2026, 7, 25, 23, 0, 0)
    expect(getWorkedPaidSeconds(DEFAULT_PROFILE, now)).toBe(8 * 3600)
  })

  it('converts price to required work time', () => {
    expect(priceToWorkSeconds(100, 2)).toBe(50)
  })

  it('computes slacking earnings', () => {
    expect(slackingEarned('2026-08-25T10:00:00Z', '2026-08-25T10:10:00Z', 0.5)).toBe(300)
  })

  it('computes ownership cost', () => {
    expect(assetCostPerHour(240, new Date('2026-08-24T00:00:00Z'), new Date('2026-08-25T00:00:00Z'))).toBe(10)
  })
})
