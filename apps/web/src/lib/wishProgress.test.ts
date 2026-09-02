import { DEFAULT_PROFILE } from '@salary-flow/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WishItem } from '../types'
import { getWishProgress } from './wishProgress'

const wish: WishItem = {
  id: 'wish-1',
  name: '耳机',
  price: 100,
  createdAt: new Date(2026, 7, 3, 9).toISOString(),
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})

describe('getWishProgress', () => {
  it('counts only paid work since the wish was created', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      salary: 800,
      monthlyWorkDays: 10,
      monthlyRateBasis: 'average' as const,
    }
    const result = getWishProgress(wish, profile, new Date(2026, 7, 3, 14), [], [])

    expect(result.earnedAmount).toBeCloseTo(40)
    expect(result.progress).toBeCloseTo(0.4)
    expect(result.remainingAmount).toBeCloseTo(60)
    expect(result.estimatedAt).toEqual(new Date(2026, 7, 4, 11))
  })

  it('marks a free wish complete immediately', () => {
    const result = getWishProgress({ ...wish, price: 0 }, DEFAULT_PROFILE, new Date(2026, 7, 3, 9))
    expect(result.progress).toBe(1)
    expect(result.remainingSeconds).toBe(0)
    expect(result.estimatedAt).toEqual(new Date(2026, 7, 3, 9))
  })
})
