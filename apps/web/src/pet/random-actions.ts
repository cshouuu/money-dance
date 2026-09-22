import type { PetPack } from '../lib/desktop'
import { PET_CLIPS, clipDuration, type PetMotion } from './motion'

export interface RandomAction { key: string; motion: PetMotion; clipKey?: string; duration: number }
export function randomActions(pack?: PetPack | null): RandomAction[] {
  if (pack) return Object.entries(pack.clips).map(([key, clip]) => ({ key, motion: 'working', clipKey: key, duration: clip.durations.reduce((a, b) => a + b, 0) }))
  return (Object.keys(PET_CLIPS) as PetMotion[]).map(motion => ({ key: motion, motion, duration: clipDuration(motion) }))
}
export function nextRandomAction(actions: RandomAction[], previous?: string, random = Math.random) {
  const others = actions.filter(action => action.key !== previous)
  const choices = others.length ? others : actions
  return choices[Math.floor(random() * choices.length)]
}
