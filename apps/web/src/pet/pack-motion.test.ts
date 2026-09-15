import { describe, expect, it } from 'vitest'
import type { PackClip, PetPack } from '../lib/desktop'
import { reactionDuration, resolvePackClip, samplePackClip } from './pack-motion'
const clip: PackClip = { src: 'local', frameWidth: 100, frameHeight: 100, width: 300, height: 100, columns: 3, durations: [100, 300, 600], stillFrame: 1 }
const pack: PetPack = { id: 'test', name: 'Test', author: '', warnings: [], clips: { idle: clip, touch: { ...clip, durations: [80, 80] } }, bindings: { idle: 'idle', working: 'idle', slacking: 'idle', overtime: 'idle', rest: 'idle', love: 'touch', celebrate: 'idle' } }
describe('imported pet playback', () => {
  it('respects unequal frame durations, exact boundaries and looping after long idle gaps', () => {
    expect(samplePackClip(clip, 99, true).frame).toBe(0)
    expect(samplePackClip(clip, 100, true)).toEqual({ frame: 1, nextIn: 300 })
    expect(samplePackClip(clip, 400, true).frame).toBe(2)
    expect(samplePackClip(clip, 1000, true).frame).toBe(0)
    expect(samplePackClip(clip, 1000000400, true).frame).toBe(2)
  })
  it('plays interactions once and uses their actual duration, including idle fallback', () => {
    expect(samplePackClip(clip, 1000, false)).toEqual({ frame: 2, nextIn: Infinity })
    expect(reactionDuration(pack, 'love')).toBe(160)
    expect(reactionDuration(pack, 'celebrate')).toBe(1000)
    expect(resolvePackClip(pack, 'overtime').key).toBe('idle')
  })
  it('reduced motion selects the supplied still frame and static assets never schedule a loop', () => {
    expect(samplePackClip(clip, 999, true, true)).toEqual({ frame: 1, nextIn: Infinity })
    expect(samplePackClip({ ...clip, durations: [500], stillFrame: 0 }, 500, true).nextIn).toBe(Infinity)
    expect(samplePackClip(clip, NaN, true).frame).toBe(0)
  })
})
