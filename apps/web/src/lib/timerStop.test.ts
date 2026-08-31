import { describe, expect, it } from 'vitest'
import { createWebTimerSessionId, sameTimerStart, upsertTimerSession } from './timerStop'

describe('web timer stop identity', () => {
  it('returns the same namespaced ID for every retry of one timer', () => {
    const start = '2026-08-31T10:00:00.000Z'
    expect(createWebTimerSessionId('slacking', start)).toBe('web-slacking-1788170400000')
    expect(createWebTimerSessionId('slacking', start)).toBe(createWebTimerSessionId('slacking', start))
    expect(createWebTimerSessionId('overtime', start)).toBe('web-overtime-1788170400000')
  })

  it('rejects invalid timestamps and compares valid starts by instant', () => {
    expect(createWebTimerSessionId('slacking', 'bad')).toBeNull()
    expect(sameTimerStart('2026-08-31T10:00:00.000Z', '2026-08-31T18:00:00.000+08:00')).toBe(true)
    expect(sameTimerStart('bad', 'bad')).toBe(false)
  })

  it('replaces the same logical stop across retries without duplicating it', () => {
    const first = {
      id: 'web-slacking-1',
      startTime: '2026-08-31T10:00:00.000Z',
      endTime: '2026-08-31T10:30:00.000Z',
    }
    const retry = { ...first, endTime: '2026-08-31T10:31:00.000Z' }
    const existingWithAnotherId = { ...first, id: 'native-session' }

    expect(upsertTimerSession([first], retry)).toEqual([retry])
    expect(upsertTimerSession([existingWithAnotherId], retry)).toEqual([retry])
  })
})
