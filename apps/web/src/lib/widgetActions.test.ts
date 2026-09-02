import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActiveOvertime } from '../types'
import { captureSessionStartBusinessDate } from './sessionBusinessDate'
import { keys } from './storage'
import {
  applyWidgetActions,
  loadWidgetActionState,
  parseWidgetActions,
  prepareOvertimeWebStop,
  prepareSlackingWebStop,
  type WidgetAction,
  type WidgetStorage,
} from './widgetActions'

class MemoryStorage implements WidgetStorage {
  readonly values = new Map<string, string>()
  failKey: string | null = null

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (key === this.failKey) throw new Error('write failed')
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    if (key === this.failKey) throw new Error('remove failed')
    this.values.delete(key)
  }
}

const startAt = new Date(2026, 7, 28, 18).getTime()
const endAt = startAt + 3_600_000

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('native widget action parsing', () => {
  it('accepts a JSON action journal and filters damaged entries', () => {
    const actions = parseWidgetActions(JSON.stringify([
      { actionId: 'start-1', type: 'slacking_start', occurredAt: startAt, sessionId: 'session-1', startLocalDate: '2026-08-28', startTimezoneOffsetMinutes: -840 },
      { actionId: 'missing-session', type: 'slacking_start', occurredAt: startAt },
      { actionId: 'bad-time', type: 'slacking_stop', occurredAt: startAt, sessionId: 'session-2', startAt: 'no', endAt, earnedAmount: 1 },
      { actionId: 'unknown', type: 'other', occurredAt: startAt, sessionId: 'session-3' },
    ]))

    expect(actions).toEqual([{
      actionId: 'start-1',
      type: 'slacking_start',
      occurredAt: startAt,
      sessionId: 'session-1',
      startLocalDate: '2026-08-28',
      startTimezoneOffsetMinutes: -840,
    }])
    expect(parseWidgetActions('{bad json')).toEqual([])
  })
})

describe('widget action persistence', () => {
  it('replays slacking start and stop without duplicating the session', () => {
    const storage = new MemoryStorage()
    const actions: WidgetAction[] = [{
      actionId: 'action-start',
      type: 'slacking_start',
      occurredAt: startAt,
      sessionId: 'slacking-1',
    }, {
      actionId: 'action-stop',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'slacking-1',
      startAt,
      endAt,
      earnedAmount: 12.5,
    }]

    expect(applyWidgetActions(actions, storage)).toEqual({
      success: true,
      changed: true,
      actionIds: ['action-start', 'action-stop'],
    })
    expect(loadWidgetActionState(storage).activeSlacking).toBeNull()
    expect(loadWidgetActionState(storage).slackingSessions).toEqual([{
      id: 'slacking-1',
      startTime: new Date(startAt).toISOString(),
      ...captureSessionStartBusinessDate(new Date(startAt).toISOString()),
      endTime: new Date(endAt).toISOString(),
      durationSeconds: 3600,
      paidDurationSeconds: 3600,
      earnedAmount: 12.5,
    }])

    expect(applyWidgetActions(actions, storage).changed).toBe(false)
    expect(loadWidgetActionState(storage).slackingSessions).toHaveLength(1)
  })

  it('persists an overtime session and exactly one linked ledger entry across replays', () => {
    const storage = new MemoryStorage()
    const active: ActiveOvertime = {
      startTime: new Date(startAt).toISOString(),
      payMode: 'multiplier',
      multiplier: 1.5,
    }
    storage.setItem(keys.activeOvertime, JSON.stringify(active))
    const action: WidgetAction = {
      actionId: 'overtime-stop',
      type: 'overtime_stop',
      occurredAt: endAt,
      sessionId: 'overtime-1',
      startAt,
      endAt,
      earnedAmount: 30,
      payMode: 'multiplier',
      multiplier: 1.5,
    }

    expect(applyWidgetActions([action], storage).success).toBe(true)
    expect(applyWidgetActions([action], storage).success).toBe(true)
    const state = loadWidgetActionState(storage)
    expect(state.activeOvertime).toBeNull()
    expect(state.overtimeSessions).toHaveLength(1)
    expect(state.overtimeSessions[0]).toMatchObject({
      id: 'overtime-1',
      durationSeconds: 3600,
      earnedAmount: 30,
      payMode: 'multiplier',
      multiplier: 1.5,
    })
    expect(state.ledger.filter(entry => entry.kind === 'overtime' && entry.linkedId === 'overtime-1')).toHaveLength(1)
  })

  it('repairs a missing ledger entry after a partial write without duplicating the session', () => {
    const storage = new MemoryStorage()
    storage.setItem(keys.activeOvertime, JSON.stringify({
      startTime: new Date(startAt).toISOString(),
      payMode: 'fixed',
      fixedAmount: 40,
    }))
    const action: WidgetAction = {
      actionId: 'fixed-stop',
      type: 'overtime_stop',
      occurredAt: endAt,
      sessionId: 'overtime-fixed',
      startAt,
      endAt,
      earnedAmount: 40,
      payMode: 'fixed',
      fixedAmount: 40,
    }
    storage.failKey = keys.ledger

    expect(applyWidgetActions([action], storage)).toMatchObject({ success: false, actionIds: [] })
    expect(loadWidgetActionState(storage).overtimeSessions).toHaveLength(1)
    expect(loadWidgetActionState(storage).ledger).toHaveLength(0)

    storage.failKey = null
    expect(applyWidgetActions([action], storage).success).toBe(true)
    const state = loadWidgetActionState(storage)
    expect(state.overtimeSessions).toHaveLength(1)
    expect(state.ledger).toHaveLength(1)
  })

  it('does not let an old stop action erase a newer active timer', () => {
    const storage = new MemoryStorage()
    const newerStart = endAt + 1000
    storage.setItem(keys.activeSlacking, JSON.stringify(new Date(newerStart).toISOString()))
    const action: WidgetAction = {
      actionId: 'old-stop',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'old-session',
      startAt,
      endAt,
      earnedAmount: 1,
    }

    applyWidgetActions([action], storage)
    expect(loadWidgetActionState(storage).activeSlacking).toEqual({
      startTime: new Date(newerStart).toISOString(),
      ...captureSessionStartBusinessDate(new Date(newerStart).toISOString()),
    })
  })

  it('deduplicates a native slacking stop when the Web page already ended the same timer', () => {
    const storage = new MemoryStorage()
    storage.setItem(keys.sessions, JSON.stringify([{
      id: 'web-session',
      startTime: new Date(startAt).toISOString(),
      endTime: new Date(endAt + 500).toISOString(),
      durationSeconds: 3600.5,
      earnedAmount: 12.6,
    }]))
    const action: WidgetAction = {
      actionId: 'native-stop',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'native-session',
      startAt,
      endAt,
      earnedAmount: 12.5,
    }

    expect(applyWidgetActions([action], storage).success).toBe(true)
    expect(loadWidgetActionState(storage).slackingSessions).toEqual([
      expect.objectContaining({ id: 'web-session', earnedAmount: 12.6 }),
    ])
  })

  it('deduplicates a native overtime stop and its ledger after the Web page already ended the timer', () => {
    const storage = new MemoryStorage()
    storage.setItem(keys.overtimeSessions, JSON.stringify([{
      id: 'web-overtime',
      startTime: new Date(startAt).toISOString(),
      endTime: new Date(endAt + 500).toISOString(),
      durationSeconds: 3600.5,
      earnedAmount: 31,
      payMode: 'multiplier',
      multiplier: 1.5,
    }]))
    storage.setItem(keys.ledger, JSON.stringify([{
      id: 'web-ledger',
      kind: 'overtime',
      direction: 'income',
      amount: 31,
      source: '加班收入',
      occurredAt: new Date(startAt).toISOString(),
      linkedId: 'web-overtime',
    }]))
    const action: WidgetAction = {
      actionId: 'native-overtime-stop',
      type: 'overtime_stop',
      occurredAt: endAt,
      sessionId: 'native-overtime',
      startAt,
      endAt,
      earnedAmount: 30,
      payMode: 'multiplier',
      multiplier: 1.5,
    }

    expect(applyWidgetActions([action], storage).success).toBe(true)
    const state = loadWidgetActionState(storage)
    expect(state.overtimeSessions).toHaveLength(1)
    expect(state.overtimeSessions[0]?.id).toBe('web-overtime')
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]?.linkedId).toBe('web-overtime')
  })

  it('blocks a stale Web stop after the native widget already finished the same timers', () => {
    const storage = new MemoryStorage()
    const startTime = new Date(startAt).toISOString()
    storage.setItem(keys.activeSlacking, JSON.stringify(startTime))
    storage.setItem(keys.activeOvertime, JSON.stringify({
      startTime,
      payMode: 'multiplier',
      multiplier: 2,
    }))
    const actions: WidgetAction[] = [{
      actionId: 'native-slacking-stop-first',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'native-slacking-session',
      startAt,
      endAt,
      earnedAmount: 10,
    }, {
      actionId: 'native-overtime-stop-first',
      type: 'overtime_stop',
      occurredAt: endAt,
      sessionId: 'native-overtime-session',
      startAt,
      endAt,
      earnedAmount: 40,
      payMode: 'multiplier',
      multiplier: 2,
    }]

    expect(applyWidgetActions(actions, storage).success).toBe(true)
    const slacking = prepareSlackingWebStop(startTime, storage)
    const overtime = prepareOvertimeWebStop(startTime, storage)

    expect(slacking).toMatchObject({
      shouldStop: false,
      active: null,
      completedSession: { id: 'native-slacking-session' },
    })
    expect(overtime).toMatchObject({
      shouldStop: false,
      active: null,
      completedSession: { id: 'native-overtime-session' },
    })
    expect(overtime.sessions).toHaveLength(1)
    expect(overtime.ledger).toHaveLength(1)
    expect(overtime.ledger[0]?.linkedId).toBe('native-overtime-session')
  })

  it('recovers from damaged stored arrays before applying a valid action', () => {
    const storage = new MemoryStorage()
    storage.setItem(keys.sessions, JSON.stringify({ not: 'an array' }))
    storage.setItem(keys.ledger, JSON.stringify([null, { id: '', kind: 'overtime' }]))
    const action: WidgetAction = {
      actionId: 'recovery-stop',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'recovered-session',
      startAt,
      endAt,
      earnedAmount: 5,
    }

    expect(() => applyWidgetActions([action], storage)).not.toThrow()
    expect(loadWidgetActionState(storage).slackingSessions).toHaveLength(1)
  })

  it('keeps existing original-zone metadata when replaying legacy stop actions', () => {
    vi.stubEnv('TZ', 'Etc/GMT+12')
    const storage = new MemoryStorage()
    const originalStart = '2026-08-31T09:30:00.000Z'
    const originalEnd = '2026-08-31T10:30:00.000Z'
    storage.setItem(keys.sessions, JSON.stringify([{
      id: 'existing-slacking',
      startTime: originalStart,
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
      endTime: originalEnd,
      durationSeconds: 3600,
      earnedAmount: 10,
    }]))
    storage.setItem(keys.overtimeSessions, JSON.stringify([{
      id: 'existing-overtime',
      startTime: originalStart,
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
      endTime: originalEnd,
      durationSeconds: 3600,
      earnedAmount: 20,
      payMode: 'fixed',
      fixedAmount: 20,
    }]))

    const startAt = new Date(originalStart).getTime()
    const endAt = new Date(originalEnd).getTime()
    const legacyActions: WidgetAction[] = [{
      actionId: 'legacy-slacking-replay',
      type: 'slacking_stop',
      occurredAt: endAt,
      sessionId: 'existing-slacking',
      startAt,
      endAt,
      earnedAmount: 10,
    }, {
      actionId: 'legacy-overtime-replay',
      type: 'overtime_stop',
      occurredAt: endAt,
      sessionId: 'existing-overtime',
      startAt,
      endAt,
      earnedAmount: 20,
      payMode: 'fixed',
      fixedAmount: 20,
    }]

    expect(applyWidgetActions(legacyActions, storage).success).toBe(true)
    const state = loadWidgetActionState(storage)
    expect(state.slackingSessions[0]).toMatchObject({
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
    })
    expect(state.overtimeSessions[0]).toMatchObject({
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
    })
  })

  it('uses native start-zone metadata for sessions and overtime ledger dates', () => {
    vi.stubEnv('TZ', 'Etc/GMT+12')
    const storage = new MemoryStorage()
    const originalStart = '2026-08-31T09:30:00.000Z'
    const originalEnd = '2026-08-31T10:30:00.000Z'
    const action: WidgetAction = {
      actionId: 'zoned-overtime-stop',
      type: 'overtime_stop',
      occurredAt: new Date(originalEnd).getTime(),
      sessionId: 'zoned-overtime',
      startAt: new Date(originalStart).getTime(),
      endAt: new Date(originalEnd).getTime(),
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
      earnedAmount: 20,
      payMode: 'fixed',
      fixedAmount: 20,
    }

    expect(applyWidgetActions([action], storage).success).toBe(true)
    const state = loadWidgetActionState(storage)
    expect(state.overtimeSessions[0]).toMatchObject({
      startLocalDate: '2026-08-31',
      startTimezoneOffsetMinutes: -840,
    })
    expect(state.ledger[0]?.localDate).toBe('2026-08-31')
  })
})
