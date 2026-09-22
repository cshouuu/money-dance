import { describe, expect, it } from 'vitest'
import { nextRandomAction, randomActions } from './random-actions'
import type { PetPack } from '../lib/desktop'

describe('random pet actions', () => {
  it('uses all six built-in sequences without immediately repeating', () => {
    const actions = randomActions()
    expect(actions).toHaveLength(6)
    for (const action of actions) {
      expect(action.duration).toBeGreaterThan(0)
      expect(nextRandomAction(actions, action.key, () => 0).key).not.toBe(action.key)
    }
  })
  it('includes imported clips even when not bound to a work state', () => {
    const pack = { clips: { idle: { durations: [200, 300] }, dance: { durations: [800, 900] } } } as unknown as PetPack
    const actions = randomActions(pack)
    expect(nextRandomAction(actions, 'idle', () => 0)).toEqual({ key: 'dance', motion: 'working', clipKey: 'dance', duration: 1700 })
    expect(nextRandomAction([actions[0]], 'idle', () => 0)).toEqual(actions[0])
    expect(nextRandomAction([], undefined, () => 0)).toBeUndefined()
  })
})
