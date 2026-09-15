import type { CSSProperties } from 'react'
import type { PetMood } from '../lib/desktop'
import { usePetMotion } from './usePetMotion'
import type { PetReaction } from './motion'
import { PhotoScene } from './PhotoScene'
import atlas from './assets/xiaoxin-atlas-v2.png'
import atlasLayout from './assets/xiaoxin-atlas-v2.json'
import './pet-character.css'

export const moodLabels: Record<PetMood, string> = { working: '爪爪打字', slacking: '偷闲抱鱼', overtime: '揉眼递热饮', rest: '蜷起来睡觉' }
export function PetCharacter({ image, mood, size = 160, reducedMotion = false, reaction = null, replayKey = 0, showCue = false }: {
  image?: string | null; mood: PetMood; size?: number; reducedMotion?: boolean
  reaction?: PetReaction | null; replayKey?: number | string; showCue?: boolean
}) {
  const motion = reaction ?? mood
  const frame = usePetMotion(motion, reducedMotion, replayKey)
  const crop = atlasLayout.frames[frame.row * atlasLayout.columns + frame.frame]
  return <div className={`pet-character pet-${motion}${reducedMotion ? ' pet-still' : ''}${image ? ' pet-photo' : ' pet-illustrated'}`} style={{ '--pet-size': `${size}px` } as CSSProperties} data-motion={motion} data-pose={frame.frame}>
    {image ? <><img className="pet-photo-body" src={image} alt="你的照片桌宠，搭配场景陪伴" draggable={false}/><PhotoScene key={`${motion}-${replayKey}`} motion={motion}/></> :
      <svg className="pet-sprite" viewBox="0 0 192 192" role="img" aria-label={`小薪，奶油绒毛猫咪：${frame.cue}`}>
        <svg x={(192 - crop.width) / 2} y={180 - atlasLayout.baselines[frame.row] + crop.y} width={crop.width} height={crop.height} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} overflow="hidden">
          <image href={atlas} width={atlasLayout.width} height={atlasLayout.height}/>
        </svg>
      </svg>}
    {showCue && <span className="pet-motion-cue" aria-hidden="true">{image ? '照片场景陪伴' : frame.cue}</span>}
  </div>
}
