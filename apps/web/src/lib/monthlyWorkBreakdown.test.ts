import { describe, expect, it } from 'vitest'
import type { OvertimeSession, SlackingSession } from '../types'
import { monthlyWorkBreakdown } from './monthlyWorkBreakdown'

const at = (day: number, hour: number) => new Date(2026, 7, day, hour)
const interval = (day: number, start: number, end: number) => ({ start: +at(day, start), end: +at(day, end) })
const now = at(31, 23)
const overtime = (day: number, start: number, end: number, earnedAmount = 0): OvertimeSession => ({
  id: `ot-${day}-${start}`, startTime: at(day, start).toISOString(), endTime: at(day, end).toISOString(),
  startLocalDate: `2026-08-${String(day).padStart(2, '0')}`, durationSeconds: (end - start) * 3600,
  payMode: 'unpaid', earnedAmount,
})
const slack = (day: number, start: number, end: number): SlackingSession => ({ ...overtime(day, start, end), earnedAmount: 100 })

describe('monthly work breakdown', () => {
  it('counts slacking as a subset, includes unpaid overtime and excludes slacking earnings', () => {
    const stats = monthlyWorkBreakdown('2026-08', [interval(3, 9, 17)], [overtime(3, 18, 20)], [slack(3, 10, 11)], 800, now)
    expect(stats).toMatchObject({ normalWorkedSeconds: 8 * 3600, overtimeSeconds: 2 * 3600, totalWorkedSeconds: 10 * 3600, slackingSeconds: 3600, netWorkedSeconds: 9 * 3600, workIncome: 800, averageHourlyIncome: 80 })
    expect(stats.netHourlyIncome).toBeCloseTo(800 / 9)
  })

  it('includes paid overtime income only once', () => {
    const stats = monthlyWorkBreakdown('2026-08', [interval(3, 9, 17)], [overtime(3, 18, 20, 400)], [], 800, now)
    expect(stats).toMatchObject({ workIncome: 1200, overtimeIncome: 400, averageHourlyIncome: 120 })
  })

  it('deduplicates flexible work excess and honors overtime segment breaks', () => {
    const ot = { ...overtime(3, 17, 21, 300), segments: [
      { startTime: at(3, 17).toISOString(), endTime: at(3, 18).toISOString() },
      { startTime: at(3, 19).toISOString(), endTime: at(3, 21).toISOString() },
    ] }
    const stats = monthlyWorkBreakdown('2026-08', [interval(3, 9, 18), interval(3, 19, 21)], [ot], [slack(3, 18, 20)], 800, now)
    expect(stats).toMatchObject({ normalWorkedSeconds: 8 * 3600, overtimeSeconds: 3 * 3600, totalWorkedSeconds: 11 * 3600, slackingSeconds: 3600, workIncome: 1100, averageHourlyIncome: 100 })
  })

  it('clips and deduplicates slacking against work, never creating negative net time', () => {
    const stats = monthlyWorkBreakdown('2026-08', [interval(3, 9, 12), interval(3, 13, 17)], [], [slack(3, 8, 15), slack(3, 10, 18)], 700, now)
    expect(stats).toMatchObject({ totalWorkedSeconds: 7 * 3600, slackingSeconds: 7 * 3600, netWorkedSeconds: 0, averageHourlyIncome: 100, netHourlyIncome: null })
  })

  it('attributes cross-month income and time together to the stored start day', () => {
    const crossMonth = { ...overtime(31, 22, 26, 400), startLocalDate: '2026-08-31' }
    const ended = new Date(2026, 8, 1, 3)
    expect(monthlyWorkBreakdown('2026-08', [], [crossMonth], [], 0, ended)).toMatchObject({ totalWorkedSeconds: 4 * 3600, overtimeIncome: 400, averageHourlyIncome: 100 })
    expect(monthlyWorkBreakdown('2026-09', [], [crossMonth], [], 0, ended)).toMatchObject({ totalWorkedSeconds: 0, overtimeIncome: 0, averageHourlyIncome: null })
  })

  it('uses stored business dates after a timezone change', () => {
    const session = { ...overtime(1, 0, 2, 200), startLocalDate: '2026-07-31' }
    expect(monthlyWorkBreakdown('2026-08', [], [session], [], 0, now).overtimeSeconds).toBe(0)
    expect(monthlyWorkBreakdown('2026-07', [], [session], [], 0, now).averageHourlyIncome).toBe(100)
  })

  it('excludes future and invalid sessions, with no rate when no work is recorded', () => {
    const invalid = { ...overtime(3, 9, 11, 200), startTime: 'invalid' }
    const stats = monthlyWorkBreakdown('2026-08', [], [invalid, overtime(3, 18, 20, 200)], [slack(3, 12, 13)], 0, at(3, 10))
    expect(stats).toMatchObject({ totalWorkedSeconds: 0, workIncome: 0, slackingSeconds: 0, averageHourlyIncome: null, netHourlyIncome: null })
  })
})
