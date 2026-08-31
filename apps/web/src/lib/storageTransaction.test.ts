import { describe, expect, it, vi } from 'vitest'
import { runReversibleStorageTransaction } from './storageTransaction'

describe('reversible storage transaction', () => {
  it('keeps all writes when every step succeeds', () => {
    const rollback = vi.fn()
    const result = runReversibleStorageTransaction([
      { write: () => true, rollback },
      { write: () => true, rollback },
    ])

    expect(result).toEqual({ success: true, failedStep: null })
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rolls completed writes back in reverse order after a later failure', () => {
    const order: string[] = []
    const result = runReversibleStorageTransaction([
      { write: () => { order.push('write-session'); return true }, rollback: () => { order.push('rollback-session') } },
      { write: () => { order.push('write-ledger'); return true }, rollback: () => { order.push('rollback-ledger') } },
      { write: () => false, rollback: () => { order.push('rollback-achievement') } },
    ])

    expect(result).toEqual({ success: false, failedStep: 2 })
    expect(order).toEqual(['write-session', 'write-ledger', 'rollback-achievement', 'rollback-ledger', 'rollback-session'])
  })

  it('treats a thrown write as failure and still rolls back', () => {
    const rollback = vi.fn()
    const failedRollback = vi.fn()
    const result = runReversibleStorageTransaction([
      { write: () => true, rollback },
      { write: () => { throw new Error('quota') }, rollback: failedRollback },
    ])

    expect(result).toEqual({ success: false, failedStep: 1 })
    expect(rollback).toHaveBeenCalledOnce()
    expect(failedRollback).toHaveBeenCalledOnce()
  })

  it('restores completed timer data when clearing the active timer fails', () => {
    const state = {
      active: '2026-08-31T10:00:00.000Z' as string | null,
      sessions: [] as string[],
      ledger: [] as string[],
      achievementSeconds: 0,
    }
    const result = runReversibleStorageTransaction([
      {
        write: () => { state.sessions = ['stable-session']; return true },
        rollback: () => { state.sessions = [] },
      },
      {
        write: () => { state.ledger = ['stable-ledger']; return true },
        rollback: () => { state.ledger = [] },
      },
      {
        write: () => { state.achievementSeconds = 3600; return true },
        rollback: () => { state.achievementSeconds = 0 },
      },
      {
        write: () => false,
        rollback: () => { state.active = '2026-08-31T10:00:00.000Z' },
      },
    ])

    expect(result).toEqual({ success: false, failedStep: 3 })
    expect(state).toEqual({
      active: '2026-08-31T10:00:00.000Z',
      sessions: [],
      ledger: [],
      achievementSeconds: 0,
    })
  })

  it('repairs all completed-stop stores without touching a newer active timer', () => {
    const state = {
      active: '2026-08-31T12:00:00.000Z' as string | null,
      sessions: ['native-session'],
      ledger: [] as string[],
      achievementSeconds: 0,
    }
    const result = runReversibleStorageTransaction([
      {
        write: () => { state.sessions = ['native-session']; return true },
        rollback: () => { state.sessions = ['native-session'] },
      },
      {
        write: () => { state.ledger = ['stable-native-ledger']; return true },
        rollback: () => { state.ledger = [] },
      },
      {
        write: () => { state.achievementSeconds = 3600; return true },
        rollback: () => { state.achievementSeconds = 0 },
      },
    ])

    expect(result).toEqual({ success: true, failedStep: null })
    expect(state).toEqual({
      active: '2026-08-31T12:00:00.000Z',
      sessions: ['native-session'],
      ledger: ['stable-native-ledger'],
      achievementSeconds: 3600,
    })
  })

  it('rolls a failed completed-stop repair back and preserves an unrelated timer', () => {
    const state = {
      active: '2026-08-31T12:00:00.000Z' as string | null,
      sessions: ['native-session'],
      ledger: [] as string[],
      achievementSeconds: 0,
    }
    const result = runReversibleStorageTransaction([
      {
        write: () => { state.sessions = ['native-session']; return true },
        rollback: () => { state.sessions = ['native-session'] },
      },
      {
        write: () => { state.ledger = ['stable-native-ledger']; return true },
        rollback: () => { state.ledger = [] },
      },
      {
        write: () => false,
        rollback: () => { state.achievementSeconds = 0 },
      },
    ])

    expect(result).toEqual({ success: false, failedStep: 2 })
    expect(state).toEqual({
      active: '2026-08-31T12:00:00.000Z',
      sessions: ['native-session'],
      ledger: [],
      achievementSeconds: 0,
    })
  })
})
