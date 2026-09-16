import type { PetMood } from '../lib/desktop'

export type PetReaction = 'love' | 'celebrate'
export type PetMotion = PetMood | PetReaction
interface Beat { frame: number; ms: number; cue: string }
interface Clip { row: number; still: number; loopFrom: number | null; beats: Beat[] }
const beat = (frame: number, ms: number, cue: string): Beat => ({ frame, ms, cue })

// Timed poses, not an indiscriminate steps(8) loop. The pause is part of the acting.
export const PET_CLIPS: Record<PetMotion, Clip> = {
  working: { row: 0, still: 0, loopFrom: 0, beats: [
    beat(0, 1100, '看看今天的小目标'), beat(1, 180, '左爪敲一下'), beat(2, 180, '右爪接着敲'),
    beat(3, 240, '认真打字中'), beat(1, 180, '哒哒，哒哒'), beat(2, 180, '哒哒，哒哒'),
    beat(4, 140, '眨一下眼'), beat(5, 220, '继续这件小事'), beat(6, 240, '继续这件小事'),
    beat(7, 2800, '写完一段，陪你想一想'),
  ] },
  slacking: { row: 1, still: 5, loopFrom: 0, beats: [
    beat(0, 650, '先看看左边'), beat(1, 650, '再悄悄看看右边'), beat(2, 450, '找到藏好的小鱼'),
    beat(3, 400, '两只爪爪抱起来'), beat(4, 650, '抱住啦'), beat(5, 850, '用脸颊蹭蹭小鱼'),
    beat(6, 700, '换个舒服的姿势'), beat(7, 4200, '安心躺一会儿'),
    beat(6, 450, '慢慢坐起来'), beat(3, 350, '把小鱼放回旁边'), beat(2, 500, '把小鱼放回旁边'),
  ] },
  overtime: { row: 2, still: 6, loopFrom: 4, beats: [
    beat(0, 950, '有点困了'), beat(1, 700, '用爪爪揉揉眼睛'), beat(2, 500, '缓一口气'),
    beat(3, 650, '先歇一下'), beat(4, 800, '捧起一杯温热'), beat(5, 1200, '把热饮递到你面前'),
    beat(6, 1800, '辛苦啦，喝一口再忙'), beat(7, 6000, '不催你，安静陪着你'), beat(6, 850, '能收工就早点休息'),
  ] },
  rest: { row: 3, still: 6, loopFrom: 5, beats: [
    beat(0, 850, '打一个大大的哈欠'), beat(1, 550, '慢慢垂下眼睛'), beat(2, 600, '把脑袋放低'),
    beat(3, 650, '把爪爪收好'), beat(4, 650, '尾巴圈住自己'), beat(5, 2400, '蜷起来，睡个好觉'),
    beat(6, 2400, '呼——吸——'), beat(7, 3000, '今天就到这里啦'), beat(6, 2400, '安静陪你休息'),
  ] },
  love: { row: 4, still: 4, loopFrom: null, beats: [
    beat(0, 250, '嗯？你来啦'), beat(1, 350, '抬头看你'), beat(2, 450, '把脸颊凑过来'),
    beat(3, 650, '闭上眼睛，蹭蹭'), beat(4, 850, '再贴近一点'), beat(5, 650, '舒服得收起小耳朵'),
    beat(6, 500, '心满意足'), beat(7, 550, '继续陪你'),
  ] },
  celebrate: { row: 5, still: 6, loopFrom: null, beats: [
    beat(0, 300, '蹲下来，蓄力'), beat(1, 180, '举起两只爪爪'), beat(2, 200, '跳起来啦'),
    beat(3, 500, '这个小进步值得开心'), beat(4, 220, '软软地落地'), beat(5, 850, '接住今天的小收获'),
    beat(6, 1100, '抱紧这枚小金币'), beat(7, 900, '每一点积累都算数'),
  ] },
}
export function clipDuration(motion: PetMotion) { return PET_CLIPS[motion].beats.reduce((sum, item) => sum + item.ms, 0) }
export function samplePetMotion(motion: PetMotion, elapsedMs: number, still = false) {
  const clip = PET_CLIPS[motion]
  if (still) return { row: clip.row, frame: clip.still, cue: clip.beats.find(item => item.frame === clip.still)!.cue, nextIn: Infinity }
  let elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  const duration = clipDuration(motion)
  if (elapsed >= duration) {
    if (clip.loopFrom === null) { const last = clip.beats.at(-1)!; return { row: clip.row, frame: last.frame, cue: last.cue, nextIn: Infinity } }
    const intro = clip.beats.slice(0, clip.loopFrom).reduce((sum, item) => sum + item.ms, 0)
    elapsed = intro + (elapsed - intro) % (duration - intro)
  }
  for (const item of clip.beats) {
    if (elapsed < item.ms) return { row: clip.row, frame: item.frame, cue: item.cue, nextIn: item.ms - elapsed }
    elapsed -= item.ms
  }
  throw new Error('Invalid pet animation timeline')
}
