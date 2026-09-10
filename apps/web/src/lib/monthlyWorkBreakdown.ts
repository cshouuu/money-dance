import type { OvertimeSession, SlackingSession } from '../types'
import { sessionStartLocalDate } from './sessionBusinessDate'

export type WorkInterval = { start: number; end: number }

function merge(intervals: readonly WorkInterval[]): WorkInterval[] {
  const result: WorkInterval[] = []
  for (const interval of intervals.filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start).sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1)
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end)
    else result.push({ ...interval })
  }
  return result
}

function seconds(intervals: readonly WorkInterval[]): number {
  return merge(intervals).reduce((total, interval) => total + (interval.end - interval.start) / 1000, 0)
}

function subtract(intervals: readonly WorkInterval[], excluded: readonly WorkInterval[]): WorkInterval[] {
  return merge(excluded).reduce((remaining, cut) => remaining.flatMap(interval => {
    if (cut.end <= interval.start || cut.start >= interval.end) return [interval]
    return [
      { start: interval.start, end: Math.min(interval.end, cut.start) },
      { start: Math.max(interval.start, cut.end), end: interval.end },
    ].filter(item => item.end > item.start)
  }), merge(intervals))
}

function sessionIntervals(session: OvertimeSession | SlackingSession): WorkInterval[] {
  const segments = 'segments' in session && session.segments?.length ? session.segments : [session]
  return segments.map(segment => ({ start: Date.parse(segment.startTime), end: Date.parse(segment.endTime) }))
}

/** Timers are attributed to their stored start business date, like overtime income.
 * Completed records only: an unfinished fixed-pay timer must not inflate the rate.
 * Overtime slices take precedence over ordinary work to avoid counting flexible
 * work excess twice. Slacking is a subset of work, never additional income/time.
 */
export function monthlyWorkBreakdown(
  month: string,
  normalIntervals: readonly WorkInterval[],
  overtimeSessions: readonly OvertimeSession[],
  slackingSessions: readonly SlackingSession[],
  salaryIncome: number,
  now: Date,
) {
  const completed = <T extends OvertimeSession | SlackingSession>(sessions: readonly T[]) => sessions.filter(session => {
    const start = Date.parse(session.startTime)
    const end = Date.parse(session.endTime)
    return Number.isFinite(start) && end > start && end <= now.getTime()
  })
  const overtime = completed(overtimeSessions)
  const monthlyOvertime = overtime.filter(session => sessionStartLocalDate(session).startsWith(month + '-'))
  const overtimeIntervals = merge(monthlyOvertime.flatMap(sessionIntervals))
  const normal = subtract(normalIntervals, overtime.flatMap(sessionIntervals))
  const allWork = merge([...normal, ...overtimeIntervals])
  const totalWorkedSeconds = seconds(allWork)
  const slacking = completed(slackingSessions)
    .filter(session => sessionStartLocalDate(session).startsWith(month + '-'))
    .flatMap(sessionIntervals)
  const slackingSeconds = totalWorkedSeconds - seconds(subtract(allWork, slacking))
  const netWorkedSeconds = Math.max(0, totalWorkedSeconds - slackingSeconds)
  const overtimeIncome = monthlyOvertime.reduce((sum, session) => sum + Math.max(0, Number.isFinite(session.earnedAmount) ? session.earnedAmount : 0), 0)
  const workIncome = salaryIncome + overtimeIncome
  return {
    normalWorkedSeconds: seconds(normal),
    overtimeSeconds: seconds(overtimeIntervals),
    totalWorkedSeconds,
    slackingSeconds,
    netWorkedSeconds,
    salaryIncome,
    overtimeIncome,
    workIncome,
    averageHourlyIncome: totalWorkedSeconds > 0 ? workIncome / (totalWorkedSeconds / 3600) : null,
    netHourlyIncome: netWorkedSeconds > 0 ? workIncome / (netWorkedSeconds / 3600) : null,
  }
}
