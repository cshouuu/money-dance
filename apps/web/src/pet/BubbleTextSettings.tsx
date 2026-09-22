import { useEffect, useState } from 'react'
import type { PetSettings } from '../lib/desktop'

const scenes = [
  ['love', '摸摸', '收到你的摸摸啦，今天也一起慢慢来。'],
  ['break', '喝水 / 活动', '喝口水，让肩膀和眼睛也放个小假。'],
  ['warmth', '加班关怀', '已经很努力啦，喝口水，能收工就早点休息。'],
  ['rest', '收工休息', '今天的付出都算数，把时间留一点给自己。'],
  ['celebrate', '里程碑庆祝', '每一点积累，都值得开心一下！'],
  ['focus', '专注完成', '专注完成啦，起身放松两分钟吧。'],
] as const
type Scene = typeof scenes[number][0]
export function BubbleTextSettings({ settings, disabled, save }: {
  settings?: PetSettings; disabled: boolean; save: (changes: Partial<PetSettings>) => Promise<boolean>
}) {
  const stored = JSON.stringify(settings?.bubbleTexts ?? {})
  const [draft, setDraft] = useState<Partial<Record<Scene, string>>>({})
  const [scene, setScene] = useState<Scene>('love')
  const [preview, setPreview] = useState(0)
  useEffect(() => {
    const texts: PetSettings['bubbleTexts'] = JSON.parse(stored)
    setDraft(Object.fromEntries(scenes.map(([key]) => [key, texts?.[key]?.join('\n') ?? ''])))
  }, [stored])
  const texts = Object.fromEntries(scenes.map(([key]) => [key, (draft[key] ?? '').split('\n').map(line => line.trim()).filter(Boolean)]))
  const invalid = Object.values(texts).some(lines => lines.length > 10 || lines.some(line => [...line].length > 120))
  const choices = texts[scene]
  return <section className="pet-settings-card pet-copy-settings" aria-label="自定义气泡文案">
    <div className="pet-section-title"><div><h2>让它说你喜欢的话</h2><p>每行一句，每个场景最多 10 句，每句最多 120 字；留空使用默认文案。</p></div></div>
    <fieldset disabled={disabled} className="pet-fieldset">
      <label>气泡场景<select aria-label="气泡场景" value={scene} onChange={event => { setScene(event.target.value as Scene); setPreview(0) }}>{scenes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>想让它说的话<textarea aria-label="自定义气泡文案" rows={5} value={draft[scene] ?? ''} placeholder="每行填写一句，触发时随机说一句" onChange={event => { setDraft({ ...draft, [scene]: event.target.value }); setPreview(0) }}/></label>
      <div className="pet-copy-preview" aria-label="气泡文案预览">{choices.length ? choices[preview % choices.length] : scenes.find(([key]) => key === scene)![2]}</div>
      {!choices.length && <small>以上为默认文案示例，实际内容随提醒变化。</small>}
      {invalid && <p role="alert">每个场景最多 10 句，每句最多 120 字，请缩短后保存。</p>}
      <div className="pet-button-row"><button className="pet-primary" disabled={invalid} onClick={() => void save({ bubbleTexts: texts })}>保存文案</button><button className="pet-secondary" disabled={!choices.length} onClick={() => setPreview(value => value + 1)}>换一句预览</button><button className="pet-text-button" onClick={() => setDraft({ ...draft, [scene]: '' })}>恢复此场景默认</button></div>
      <small>编辑后点击保存。文案随机选取；收入汇报和操作结果使用系统内容，提醒时间及免打扰规则保持生效。</small>
    </fieldset>
  </section>
}
