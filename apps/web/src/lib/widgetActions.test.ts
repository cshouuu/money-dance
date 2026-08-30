import { describe, expect, it } from 'vitest'
import type { ActiveOvertime } from '../types'
import { keys } from './storage'
import {
  applyWidgetActions,
  loadWidgetActionState,
  parseWidgetActions,
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

describe('native widget action parsing', () => {
  it('accepts a JSON action journal and filters damaged entries', () => {
    const actions = parseWidgetActions(JSON.stringify([
      { actionId: 'start-1', type: 'slacking_start', occurredAt: startAt, sessionId: 'session-1' },
      { actionId: 'missing-session', type: 'slacking_start', occurredAt: startAt },
      { actionId: 'bad-time', type: 'slacking_stop', occurredAt: startAt, sessionId: 'session-2', startAt: 'no', endAt, earnedAmount: 1 },
      { actionId: 'unknown', type: 'other', occurredAt: startAt, sessionId: 'session-3' },
    ]))

    expect(actions).toEqual([{
      actionId: 'start-1',
      type: 'slacking_start',
      occurredAt: startAt,
      sessionId: 'session-1',
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
      endTime: new Date(endAt).toISOString(),
      durationSeconds: 3600,
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
    expect(loadWidgetActionState(storage).activeSlacking).toBe(new Date(newerStart).toISOString())
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
})
