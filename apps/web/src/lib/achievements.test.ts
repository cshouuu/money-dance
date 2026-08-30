import { describe, expect, it } from 'vitest'
import type { SlackingSession } from '../types'
import {
  ACHIEVEMENTS,
  achievementLevelAt,
  createEmptyAchievementState,
  elapsedSecondsSince,
  formatTimerDuration,
  getAchievementSnapshot,
  reconcileAchievementSessions,
  unlockAchievementLevel,
} from './achievements'

function session(id: string, durationSeconds: number, endTime = '2026-08-30T12:00:00.000Z'): SlackingSession {
  return {
    id,
    startTime: '2026-08-30T10:00:00.000Z',
    endTime,
    durationSeconds,
    earnedAmount: 0,
  }
}

describe('achievement definitions', () => {
  it('uses the agreed slacking and overtime thresholds', () => {
    expect(ACHIEVEMENTS.slacking.map(item => item.thresholdSeconds)).toEqual([1800, 10800, 36000, 108000, 360000])
    expect(ACHIEVEMENTS.overtime.map(item => item.thresholdSeconds)).toEqual([3600, 36000, 108000, 360000, 1080000])
  })

  it('unlocks exactly at a threshold, not one second before it', () => {
    expect(achievementLevelAt('slacking', 1799)).toBe(0)
    expect(achievementLevelAt('slacking', 1800)).toBe(1)
    expect(achievementLevelAt('overtime', 3599)).toBe(0)
    expect(achievementLevelAt('overtime', 3600)).toBe(1)
  })

  it('formats long-running timers without wrapping after 24 hours', () => {
    expect(formatTimerDuration(25 * 3600 + 2 * 60 + 3)).toBe('25:02:03')
  })

  it('safely derives active elapsed time from timestamps', () => {
    const now = new Date('2026-08-30T12:00:00.000Z')
    expect(elapsedSecondsSince('2026-08-30T11:59:00.000Z', now)).toBe(60)
    expect(elapsedSecondsSince('2026-08-30T12:01:00.000Z', now)).toBe(0)
    expect(elapsedSecondsSince('not-a-date', now)).toBe(0)
  })
})

describe('achievement lifetime reconciliation', () => {
  it('backfills old sessions chronologically and unlocks reached levels', () => {
    const state = reconcileAchievementSessions('slacking', createEmptyAchievementState(), [
      session('later', 2 * 3600, '2026-08-30T12:00:00.000Z'),
      session('earlier', 3600, '2026-08-29T12:00:00.000Z'),
    ], '2026-08-31T00:00:00.000Z')

    expect(state.lifetimeSeconds).toBe(3 * 3600)
    expect(state.processedSessionIds).toEqual(['earlier', 'later'])
    expect(state.highestLevel).toBe(2)
    expect(state.unlockedAt['slacking-1']).toBe('2026-08-29T12:00:00.000Z')
    expect(state.unlockedAt['slacking-2']).toBe('2026-08-30T12:00:00.000Z')
  })

  it('counts each session id once across repeated reconciliation', () => {
    const first = reconcileAchievementSessions('slacking', createEmptyAchievementState(), [session('same', 1800)], '2026-08-30T12:00:00.000Z')
    const second = reconcileAchievementSessions('slacking', first, [session('same', 999999)], '2026-08-31T12:00:00.000Z')

    expect(second.lifetimeSeconds).toBe(1800)
    expect(second.processedSessionIds).toEqual(['same'])
  })

  it('keeps lifetime progress and unlocked medals after history is deleted', () => {
    const earned = reconcileAchievementSessions('overtime', createEmptyAchievementState(), [session('overtime-1', 10 * 3600)], '2026-08-30T12:00:00.000Z')
    const afterClear = reconcileAchievementSessions('overtime', earned, [], '2026-08-31T12:00:00.000Z')

    expect(afterClear.lifetimeSeconds).toBe(10 * 3600)
    expect(afterClear.highestLevel).toBe(2)
    expect(afterClear.processedSessionIds).toEqual(['overtime-1'])
  })

  it('marks invalid and negative-duration sessions as processed without adding time', () => {
    const state = reconcileAchievementSessions('slacking', createEmptyAchievementState(), [
      session('negative', -1),
      session('invalid', Number.NaN),
    ], '2026-08-30T12:00:00.000Z')

    expect(state.lifetimeSeconds).toBe(0)
    expect(state.processedSessionIds).toEqual(['negative', 'invalid'])
    expect(state.highestLevel).toBe(0)
  })
})

describe('active achievement previews', () => {
  it('previews active seconds without adding them to persisted lifetime', () => {
    const state = reconcileAchievementSessions('slacking', createEmptyAchievementState(), [session('history', 1700)], '2026-08-30T12:00:00.000Z')
    const snapshot = getAchievementSnapshot('slacking', state, 100)

    expect(state.lifetimeSeconds).toBe(1700)
    expect(snapshot.totalSeconds).toBe(1800)
    expect(snapshot.highestLevel).toBe(1)
    expect(snapshot.current?.name).toBe('鱼苗试水')
  })

  it('persists a previewed level permanently without inflating lifetime', () => {
    const initial = { ...createEmptyAchievementState(), lifetimeSeconds: 1700 }
    const unlocked = unlockAchievementLevel('slacking', initial, 1, '2026-08-30T12:00:00.000Z')
    const afterActiveDisappears = getAchievementSnapshot('slacking', unlocked, 0)

    expect(unlocked.lifetimeSeconds).toBe(1700)
    expect(unlocked.highestLevel).toBe(1)
    expect(unlocked.unlockedAt['slacking-1']).toBe('2026-08-30T12:00:00.000Z')
    expect(afterActiveDisappears.highestLevel).toBe(1)
  })

  it('adds the completed active session once after it lands in history', () => {
    const previewUnlocked = unlockAchievementLevel('slacking', createEmptyAchievementState(), 1, '2026-08-30T12:00:00.000Z')
    const completed = reconcileAchievementSessions('slacking', previewUnlocked, [session('completed', 1800)], '2026-08-30T12:30:00.000Z')
    const repeated = reconcileAchievementSessions('slacking', completed, [session('completed', 1800)], '2026-08-30T12:31:00.000Z')

    expect(completed.lifetimeSeconds).toBe(1800)
    expect(repeated.lifetimeSeconds).toBe(1800)
    expect(repeated.highestLevel).toBe(1)
  })

  it('caps progress at the final achievement', () => {
    const state = { ...createEmptyAchievementState(), lifetimeSeconds: 400 * 3600, highestLevel: 5 }
    const snapshot = getAchievementSnapshot('overtime', state)

    expect(snapshot.next).toBeNull()
    expect(snapshot.progress).toBe(1)
    expect(snapshot.remainingSeconds).toBe(0)
  })
})
