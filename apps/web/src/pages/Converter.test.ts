import { describe, expect, it } from 'vitest'
import { formatWishEstimate } from './Converter'

describe('formatWishEstimate', () => {
  const now = new Date(2026, 8, 4, 10, 0)

  it('keeps the current year compact and includes the year after a year boundary', () => {
    expect(formatWishEstimate(new Date(2026, 8, 30, 17, 1), now, false)).toEqual({
      label: '预计 9/30 17:01 达成',
      state: 'pending',
    })
    expect(formatWishEstimate(new Date(2027, 0, 2, 9, 5), now, false)).toEqual({
      label: '预计 2027/1/2 09:05 达成',
      state: 'pending',
    })
  })

  it('distinguishes actual completion from a passed estimate', () => {
    expect(formatWishEstimate(new Date(2026, 8, 4, 9, 59), now, false)).toEqual({
      label: '已到达预计达成时间',
      state: 'reached',
    })
    expect(formatWishEstimate(new Date(2027, 0, 2, 9, 5), now, true)).toEqual({
      label: '已达成',
      state: 'complete',
    })
  })
})
