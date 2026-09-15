import type { CSSProperties } from 'react'
import type { PetMood, PetPack, PetPresetId } from '../lib/desktop'
import { PackCharacter } from './PackCharacter'
import { usePetMotion } from './usePetMotion'
import type { PetReaction } from './motion'
import { PhotoScene } from './PhotoScene'
import { getPetPreset, presetCue } from './presets'
import './pet-character.css'

export const moodLabels: Record<PetMood, string> = { working: '爪爪打字', slacking: '偷闲抱鱼', overtime: '揉眼递热饮', rest: '蜷起来睡觉' }
export function PetCharacter({ image, pack, presetId, idlePreview = false, mood, size = 160, reducedMotion = false, reaction = null, replayKey = 0, showCue = false }: {
  presetId?: PetPresetId
  pack?: PetPack | null
  idlePreview?: boolean
  image?: string | null; mood: PetMood; size?: number; reducedMotion?: boolean
  reaction?: PetReaction | null; replayKey?: number | string; showCue?: boolean
}) {
  const motion = reaction ?? mood
  const frame = usePetMotion(motion, reducedMotion || !!pack, replayKey)
  if (pack) return <PackCharacter pack={pack} motion={idlePreview ? 'idle' : motion} size={size} reducedMotion={reducedMotion} replayKey={replayKey} showCue={showCue}/>
  const preset = getPetPreset(presetId), atlasLayout = preset.layout
  const crop = atlasLayout.frames[frame.row * atlasLayout.columns + frame.frame]
  const cue = presetCue(preset.id, motion, frame.frame, frame.cue)
  return <div className={`pet-character pet-${motion}${reducedMotion ? ' pet-still' : ''}${image ? ' pet-photo' : ' pet-illustrated'}`} style={{ '--pet-size': `${size}px` } as CSSProperties} data-preset={preset.id} data-motion={motion} data-pose={frame.frame}>
    {image ? <><img className="pet-photo-body" src={image} alt="你的照片桌宠，搭配场景陪伴" draggable={false}/><PhotoScene key={`${motion}-${replayKey}`} motion={motion}/></> :
      <svg className="pet-sprite" viewBox={`0 0 ${preset.viewport} ${preset.viewport}`} role="img" aria-label={`${preset.name}，${preset.species}：${cue}`}>
        <svg x={(preset.viewport - crop.width) / 2} y={preset.viewport - 12 - atlasLayout.baselines[frame.row] + crop.y} width={crop.width} height={crop.height} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} overflow="hidden">
          <image href={preset.atlas} width={atlasLayout.width} height={atlasLayout.height}/>
        </svg>
      </svg>}
    {showCue && <span className="pet-motion-cue" aria-hidden="true">{image ? '照片场景陪伴' : cue}</span>}
  </div>
}
