import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, assetCostPerHour, calculateMonthlySalaryDeductions, calculateRates, getWorkedPaidSeconds, priceToWorkSeconds, slackingEarned } from './index.js'

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

  it('keeps gross rates when living cost is recorded as daily ledger expenses', () => {
    const rates = calculateRates({
      ...DEFAULT_PROFILE,
      includeLivingCost: true,
      monthlyLivingCost: 3000,
      livingCostMode: 'daily-ledger',
    })
    expect(rates.daily).toBeCloseTo(15000 / 21.75, 8)
    expect(rates.hourly).toBeCloseTo((15000 / 21.75) / 8, 8)
  })

  it('subtracts fixed and percentage payroll deductions before deriving rates', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      salaryDeductions: [
        { id: 'social', name: '社保', type: 'fixed' as const, value: 1000, enabled: true },
        { id: 'fund', name: '公积金', type: 'percentage' as const, value: 10, enabled: true },
        { id: 'off', name: '停用项', type: 'fixed' as const, value: 9999, enabled: false },
      ],
    }
    expect(calculateMonthlySalaryDeductions(profile)).toBe(2500)
    expect(calculateRates(profile).daily).toBeCloseTo((15000 - 2500) / 21.75, 8)
  })

  it('never lets payroll deductions create a negative time rate', () => {
    const rates = calculateRates({
      ...DEFAULT_PROFILE,
      salaryDeductions: [{ id: 'all', name: '扣除', type: 'percentage', value: 100, enabled: true }],
    })
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


describe('multiple scheduled breaks', () => {
  const period = (name: string, startTime: string, endTime: string) => ({ id: name, name, startTime, endTime })
  const profile = { ...DEFAULT_PROFILE, workEndTime: '20:00', breakPeriods: [period('午休', '12:00', '13:00'), period('晚休', '18:00', '18:30')] }
  it('deducts lunch and dinner both from the target and elapsed work', () => {
    expect(calculateRates(profile).paidSecondsPerDay).toBe(9.5 * 3600)
    expect(getWorkedPaidSeconds(profile, new Date(2026, 8, 7, 18, 15))).toBe(8 * 3600)
    expect(getWorkedPaidSeconds(profile, new Date(2026, 8, 7, 19))).toBe(8.5 * 3600)
  })
  it('deducts overlapping periods once and clips out-of-shift portions', () => {
    const overlapping = { ...profile, breakPeriods: [period('午休', '12:00', '13:00'), period('重叠', '12:30', '13:30'), period('班前', '08:30', '09:30'), period('班后', '21:00', '22:00')] }
    expect(calculateRates(overlapping).paidSecondsPerDay).toBe(9 * 3600)
    expect(getWorkedPaidSeconds(overlapping, new Date(2026, 8, 7, 13))).toBe(2.5 * 3600)
  })
  it('supports midnight breaks and breaks starting before an overnight shift', () => {
    const night = { ...profile, workStartTime: '22:00', workEndTime: '07:00', breakPeriods: [period('夜休', '23:30', '00:30'), period('晨休', '03:00', '03:30'), period('班前', '21:30', '22:30')] }
    expect(calculateRates(night).paidSecondsPerDay).toBe(7 * 3600)
    expect(getWorkedPaidSeconds(night, new Date(2026, 8, 8, 4))).toBe(4 * 3600)
  })
  it('preserves legacy lunch and supports paid or no scheduled breaks', () => {
    expect(calculateRates(DEFAULT_PROFILE).paidSecondsPerDay).toBe(8 * 3600)
    expect(calculateRates({ ...profile, breakPeriods: [] }).paidSecondsPerDay).toBe(11 * 3600)
    expect(calculateRates({ ...profile, paidBreak: true }).paidSecondsPerDay).toBe(11 * 3600)
  })
})
