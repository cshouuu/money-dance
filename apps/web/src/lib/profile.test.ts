import { describe, expect, it } from 'vitest'
import { ALTERNATING_MONTHLY_WORK_DAYS, recommendedMonthlyWorkDays } from './profile'

describe('recommendedMonthlyWorkDays', () => {
  it.each([
    [5, 21.67],
    [6, 26],
    [7, 30.33],
  ])('recommends a monthly value for %i work days per week', (weekly, monthly) => {
    expect(recommendedMonthlyWorkDays(weekly)).toBe(monthly)
  })

  it('recommends the average of five-day and six-day weeks for an alternating schedule', () => {
    expect(ALTERNATING_MONTHLY_WORK_DAYS).toBe(23.83)
  })
})
