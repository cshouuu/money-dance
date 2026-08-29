import { describe, expect, it } from 'vitest'
import { recommendedMonthlyWorkDays } from './profile'

describe('recommendedMonthlyWorkDays', () => {
  it.each([
    [5, 21.67],
    [6, 26],
    [7, 30.33],
  ])('recommends a monthly value for %i work days per week', (weekly, monthly) => {
    expect(recommendedMonthlyWorkDays(weekly)).toBe(monthly)
  })
})
