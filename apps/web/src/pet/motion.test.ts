import { describe, expect, it } from 'vitest'
import { clipDuration, PET_CLIPS, samplePetMotion, type PetMotion } from './motion'

describe('character acting timeline', () => {
  it('plays the yawn and curl once, then stays asleep across long elapsed time', () => {
    expect(samplePetMotion('rest', 0).frame).toBe(0)
    expect(samplePetMotion('rest', 1500).frame).toBe(2)
    for (let time = clipDuration('rest'); time < 100_000; time += 137) {
      expect(samplePetMotion('rest', time).frame).toBeGreaterThanOrEqual(5)
    }
  })
  it('rubs the eye before offering the drink, without endlessly repeating fatigue', () => {
    expect(samplePetMotion('overtime', 1000).frame).toBe(1)
    expect(samplePetMotion('overtime', 3800).frame).toBe(5)
    for (let time = clipDuration('overtime'); time < 100_000; time += 137) {
      expect(samplePetMotion('overtime', time).frame).toBeGreaterThanOrEqual(4)
    }
  })
  it('petting and celebration use different artwork and complete instead of looping', () => {
    expect(samplePetMotion('love', 1600).row).not.toBe(samplePetMotion('celebrate', 1600).row)
    for (const motion of ['love', 'celebrate'] as const) {
      expect(samplePetMotion(motion, clipDuration(motion)).nextIn).toBe(Infinity)
      expect(samplePetMotion(motion, 100_000).frame).toBe(7)
    }
  })
  it('reducing motion selects a meaningful static pose without a running timer', () => {
    expect(samplePetMotion('rest', 0, true).frame).toBe(6)
    for (const motion of Object.keys(PET_CLIPS) as PetMotion[]) expect(samplePetMotion(motion, 0, true).nextIn).toBe(Infinity)
  })
  it('frame boundaries and long background gaps never escape the 8 by 6 atlas', () => {
    for (const motion of Object.keys(PET_CLIPS) as PetMotion[]) {
      const clip = PET_CLIPS[motion]
      let elapsed = 0
      for (const beat of clip.beats) {
        expect(samplePetMotion(motion, elapsed).frame).toBe(beat.frame)
        elapsed += beat.ms
      }
      for (const time of [-1, NaN, 0, 1e9]) {
        const frame = samplePetMotion(motion, time)
        expect(frame.row).toBeGreaterThanOrEqual(0); expect(frame.row).toBeLessThan(6)
        expect(frame.frame).toBeGreaterThanOrEqual(0); expect(frame.frame).toBeLessThan(8)
        expect(frame.nextIn).toBeGreaterThan(0)
      }
    }
  })
})
