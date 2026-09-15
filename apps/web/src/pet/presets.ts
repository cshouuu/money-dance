import type { PetMood, PetPresetId } from '../lib/desktop'
import type { PetMotion } from './motion'
import catAtlas from './assets/xiaoxin-atlas-v2.png'
import catLayout from './assets/xiaoxin-atlas-v2.json'
import bunnyAtlas from './assets/mili-atlas-v1.png'
import bunnyLayout from './assets/mili-atlas-v1.json'
import capyAtlas from './assets/huanhuan-atlas-v1.png'
import capyLayout from './assets/huanhuan-atlas-v1.json'

interface PetPreset {
  id: PetPresetId; name: string; species: string; personality: string; color: string
  atlas: string; layout: typeof catLayout; viewport: number
  labels: Record<PetMood, string>; stories: Record<PetMood, string>
}
export const PET_PRESETS: PetPreset[] = [
  { id: 'xiaoxin', name: '小薪', species: '奶油猫', personality: '认真攒下每一点小幸福', color: '#eef2e5',
    atlas: catAtlas, layout: catLayout, viewport: 192,
    labels: { working: '爪爪打字', slacking: '偷闲抱鱼', overtime: '揉眼递热饮', rest: '蜷起来睡觉' },
    stories: { working: '看一眼屏幕 → 两只爪爪交替敲键盘 → 眨眼，停下来想一想', slacking: '左右偷偷看 → 拿起小鱼，抱住蹭蹭 → 躺下来安心放松', overtime: '困困地揉眼睛 → 捧起热饮递给你 → 喝一口，安静陪着', rest: '打哈欠，垂下脑袋 → 收好爪爪，尾巴圈住身体 → 蜷起来好好睡觉' } },
  { id: 'mili', name: '米粒', species: '垂耳兔', personality: '把小进步，变成小雀跃', color: '#fbede5',
    atlas: bunnyAtlas, layout: bunnyLayout, viewport: 208,
    labels: { working: '兔爪敲键盘', slacking: '抱萝卜发呆', overtime: '捧杯暖暖手', rest: '垂耳盖被被' },
    stories: { working: '凑近小电脑 → 兔爪交替打字 → 抬头想想，再笑一下', slacking: '悄悄左右看 → 抱起萝卜贴贴 → 躺下，给脑袋放个假', overtime: '揉揉困困的眼睛 → 捧起暖杯 → 喝一口，歇一歇', rest: '打个大哈欠 → 收起爪爪，耳朵垂下来 → 像小团子一样睡着' } },
  { id: 'huanhuan', name: '缓缓', species: '水豚', personality: '不着急，按自己的步子来', color: '#f3eadb',
    atlas: capyAtlas, layout: capyLayout, viewport: 208,
    labels: { working: '慢慢敲一段', slacking: '抱橘子躺平', overtime: '递一杯温茶', rest: '趴好充充电' },
    stories: { working: '看看屏幕 → 慢条斯理敲键盘 → 托腮想想，眯眼歇一下', slacking: '找到小橘子 → 抱起来闻一闻 → 橘子放肚皮，安心躺平', overtime: '揉揉眼，缓一口气 → 把温茶捧到面前 → 喝完这一口，就早点收工', rest: '长长地打个哈欠 → 收起小短腿 → 趴成一团，慢慢充电' } },
]
export function getPetPreset(id?: string): PetPreset { return PET_PRESETS.find(pet => pet.id === id) ?? PET_PRESETS[0] }
export function presetCue(id: PetPresetId, motion: PetMotion, frame: number, fallback: string) {
  if (id === 'xiaoxin') return fallback
  const object = id === 'mili' ? '萝卜' : '橘子'
  if (motion === 'slacking') return fallback.replaceAll('小鱼', object)
  if (motion === 'rest' && frame === 4) return id === 'mili' ? '耳朵软软地垂下来' : '趴好，把自己放松'
  if (motion === 'celebrate' && frame === 6 && id === 'mili') return '抱紧今天的小星星'
  if (motion === 'love' && frame === 5 && id === 'huanhuan') return '眯着眼睛，蹭蹭脸颊'
  return fallback
}
