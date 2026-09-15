import { describe, expect, it } from 'vitest'
import { getPetPreset, PET_PRESETS, presetCue } from './presets'
import { PET_CLIPS } from './motion'

describe('built-in pet assets', () => {
  it('falls back to the original kitten for old or unknown settings', () => {
    expect(getPetPreset().id).toBe('xiaoxin')
    expect(getPetPreset('removed-character').id).toBe('xiaoxin')
  })
  it.each(PET_PRESETS)('$name contains every acting frame inside the image and viewport', pet => {
    const { layout } = pet
    expect(layout.frames).toHaveLength(48)
    for (const clip of Object.values(PET_CLIPS)) for (const beat of clip.beats) {
      const crop = layout.frames[clip.row * 8 + beat.frame]
      expect(crop.row).toBe(clip.row)
      expect(crop.col).toBe(beat.frame)
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.x + crop.width).toBeLessThanOrEqual(layout.width)
      expect(crop.y + crop.height).toBeLessThanOrEqual(layout.height)
      expect(crop.width).toBeLessThanOrEqual(pet.viewport)
      const top = pet.viewport - 12 - layout.baselines[clip.row] + crop.y
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top + crop.height).toBeLessThanOrEqual(pet.viewport)
    }
  })
  it('describes each character’s actual props and anatomy', () => {
    expect(presetCue('mili', 'slacking', 5, '蹭蹭小鱼')).toBe('蹭蹭萝卜')
    expect(presetCue('huanhuan', 'slacking', 5, '蹭蹭小鱼')).toBe('蹭蹭橘子')
    for (const id of ['mili', 'huanhuan'] as const) expect(presetCue(id, 'rest', 4, '尾巴圈住自己')).not.toContain('尾巴')
  })
})
