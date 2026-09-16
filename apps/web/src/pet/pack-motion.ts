import type { PackClip, PackState, PetPack } from '../lib/desktop'
import { clipDuration, type PetReaction } from './motion'

export const packStateLabels: Record<PackState, string> = { idle: '待机', working: '工作', slacking: '摸鱼', overtime: '加班', rest: '休息', love: '摸摸', celebrate: '庆祝' }
export function resolvePackClip(pack: PetPack, state: PackState) {
  const key = pack.bindings[state] || 'idle'
  return { key: pack.clips[key] ? key : 'idle', clip: pack.clips[key] || pack.clips.idle }
}
export function reactionDuration(pack: PetPack | null | undefined, reaction: PetReaction) {
  return pack ? resolvePackClip(pack, reaction).clip.durations.reduce((a, b) => a + b, 0) : clipDuration(reaction)
}
export function samplePackClip(clip: PackClip, elapsedMs: number, loop: boolean, still = false) {
  if (still || clip.durations.length === 1) return { frame: still ? clip.stillFrame : 0, nextIn: Infinity }
  const duration = clip.durations.reduce((a, b) => a + b, 0)
  let elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  if (!loop && elapsed >= duration) return { frame: clip.durations.length - 1, nextIn: Infinity }
  elapsed %= duration
  for (let i = 0; i < clip.durations.length; i++) {
    if (elapsed < clip.durations[i]) return { frame: i, nextIn: clip.durations[i] - elapsed }
    elapsed -= clip.durations[i]
  }
  return { frame: 0, nextIn: clip.durations[0] }
}
