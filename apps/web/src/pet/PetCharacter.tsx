import type { CSSProperties } from 'react'
import type { PetMood } from '../lib/desktop'
import './pet-character.css'

export const moodLabels: Record<PetMood, string> = { working: '认真陪班', slacking: '安心摸鱼', overtime: '深夜陪伴', rest: '好好休息' }
export function PetCharacter({ image, mood, size = 160, reducedMotion = false, happy = false }: {
  image?: string | null; mood: PetMood; size?: number; reducedMotion?: boolean; happy?: boolean
}) {
  return <div className={`pet-character pet-${mood}${reducedMotion ? ' pet-still' : ''}${happy ? ' pet-happy' : ''}`} style={{ '--pet-size': `${size}px` } as CSSProperties}>
    <span className="pet-spark pet-spark-one" aria-hidden="true">{happy ? '♥' : mood === 'slacking' ? '♪' : mood === 'overtime' ? '✦' : mood === 'rest' ? 'z' : '✧'}</span>
    <span className="pet-spark pet-spark-two" aria-hidden="true">{happy ? '♥' : mood === 'rest' ? 'Z' : '·'}</span>
    <img className="pet-body" src={image || '/pet-default.svg'} alt={image ? '你的专属桌宠' : '小薪，一只奶油色猫咪'} draggable={false}/>
    <span className="pet-prop" aria-hidden="true">{mood === 'slacking' ? '🐟' : mood === 'overtime' ? '☕' : mood === 'working' ? '🌱' : '🌙'}</span>
    <span className="pet-shadow"/>
  </div>
}
