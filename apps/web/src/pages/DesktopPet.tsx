import { useEffect, useState } from 'react'
import { Bell, Check, Coffee, Eye, Heart, Monitor, MousePointer2, PawPrint, ShieldCheck, Sparkles, Upload, Volume2 } from 'lucide-react'
import { desktop, type PackState, type PetPack, type PetMood, type PetPresetId, type PetSettings } from '../lib/desktop'
import { useDesktopState } from '../lib/useDesktopState'
import { PetCharacter } from '../pet/PetCharacter'
import { type PetReaction } from '../pet/motion'
import { packStateLabels, reactionDuration } from '../pet/pack-motion'
import { PET_PRESETS, getPetPreset } from '../pet/presets'
import './DesktopPet.css'

const moods: PetMood[] = ['working', 'slacking', 'overtime', 'rest']
const previewCopy: Record<PetMood, string> = {
  working: '每一点积累，都在让心愿更近。今天也陪你慢慢来。',
  slacking: '给脑袋放个小假，偶尔发呆也没关系。',
  overtime: '已经很努力啦。喝口水，收好手头的事，就早点休息吧。',
  rest: '今天的付出都算数。接下来，把时间留一点给自己。',
}
export function DesktopPet() {
  const { state, setState, error: connectionError } = useDesktopState()
  const [presetCandidate, setPresetCandidate] = useState<PetPresetId | null>(null)
  const [mood, setMood] = useState<PetMood>('working')
  const [candidate, setCandidate] = useState<string | null>(null)
  const [packCandidate, setPackCandidate] = useState<PetPack | null>(null)
  const [bindings, setBindings] = useState<PetPack['bindings'] | null>(null)
  const [idlePreview, setIdlePreview] = useState(false)
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [name, setName] = useState('小薪')
  const [reaction, setReaction] = useState<{ kind: PetReaction; id: number } | null>(null)
  const [replay, setReplay] = useState(0)
  const basePack = candidate || presetCandidate ? null : packCandidate || state?.pack
  const previewPack = basePack ? { ...basePack, bindings: bindings || basePack.bindings } : null
  const interact = (kind: PetReaction) => { setIdlePreview(false); setReaction({ kind, id: performance.now() }) }
  const reactionMs = reaction ? reactionDuration(previewPack, reaction.kind) : 0
  useEffect(() => { if (state) setName(state.settings.name) }, [state?.settings.name])
  useEffect(() => { setBindings(state?.pack?.bindings || null) }, [state?.pack?.id])
  useEffect(() => {
    const off = desktop?.onProgress(setProgress)
    return () => { off?.(); void desktop?.cancelExtraction().catch(() => undefined) }
  }, [])
  useEffect(() => { if (!reaction) return; const timer = setTimeout(() => setReaction(null), reactionMs); return () => clearTimeout(timer) }, [reaction, reactionMs])
  const settings = state?.settings
  const preset = getPetPreset(presetCandidate ?? settings?.presetId)
  const previewImage = presetCandidate ? null : candidate || state?.image
  function previewPreset(id: PetPresetId) {
    setPresetCandidate(id); setCandidate(null); setPackCandidate(null); setBindings(null); setIdlePreview(false); setReaction(null); setReplay(value => value + 1); setNotice(''); setError('')
  }
  async function update(changes: Partial<PetSettings>) {
    if (!desktop || !settings || saving) return
    setSaving(true); setError(''); setNotice('')
    try { const next = await desktop.saveSettings({ ...settings, ...changes }); setState(next); setNotice('已保存，下次打开仍会陪着你。') }
    catch { setError('设置没有保存成功，请重试。') }
    finally { setSaving(false) }
  }
  async function selectImage(mode: 'extract' | 'transparent') {
    if (!desktop) return
    setPresetCandidate(null); setBusy(true); setProgress('请选择一张照片…'); setError(''); setNotice(''); setCandidate(null); setPackCandidate(null); setIdlePreview(false); setReaction(null)
    setBindings(state?.pack?.bindings || null)
    try { const result = await desktop.createPet(mode); if (result) { setCandidate(result); setNotice('主体准备好了，切换下面的状态看看动作。') } }
    catch (error) { setError(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '')) }
    finally { setBusy(false); setProgress('') }
  }
  async function selectPack() {
    if (!desktop) return
    setPresetCandidate(null); setBusy(true); setError(''); setNotice(''); setProgress('请选择 ZIP 动作包…'); setCandidate(null); setPackCandidate(null); setReaction(null); setIdlePreview(false)
    try {
      const pack = await desktop.importPack()
      if (pack) { setPackCandidate(pack); setBindings(pack.bindings); setNotice('动作包已准备好。预览各个动作，确认后再放到桌面。') }
      else setBindings(state?.pack?.bindings || null)
    } catch (error) { setBindings(state?.pack?.bindings || null); setError(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '')) }
    finally { setBusy(false); setProgress('') }
  }
  async function savePack() {
    if (!desktop || !previewPack) return
    setSaving(true); setError('')
    try {
      const next = packCandidate ? await desktop.usePack(previewPack.id, previewPack.bindings) : await desktop.savePackBindings(previewPack.id, previewPack.bindings)
      setState(next); setPackCandidate(null); setBindings(next.pack?.bindings || null); setNotice('动作包和状态绑定已保存，离线也能陪着你。')
    } catch { setError('动作包没有保存成功，请重新导入后重试。') }
    finally { setSaving(false) }
  }
  async function discard() {
    setPresetCandidate(null)
    setCandidate(null); setPackCandidate(null); setBindings(state?.pack?.bindings || null); setIdlePreview(false); setReaction(null)
    try { await desktop?.cancelExtraction() } catch { setError('取消未完成，请重试。') }
  }
  async function template() {
    try { if (await desktop?.savePackTemplate()) setNotice('模板已保存：解压后替换素材，按说明修改 pet.json，再压缩成 ZIP 导入。') }
    catch { setError('模板没有保存成功，请重试。') }
  }
  async function adopt() {
    if (!desktop) return
    setSaving(true); setError('')
    try { setState(await desktop.usePet()); setCandidate(null); setNotice('你的专属桌宠已经来到桌面啦！'); interact('love') }
    catch { setError('桌宠没有保存成功，请重新选择图片。') }
    finally { setSaving(false) }
  }
  async function adoptPreset() {
    if (!desktop || !presetCandidate || saving || busy) return
    setSaving(true); setError(''); setNotice('')
    try {
      const next = await desktop.resetPet(presetCandidate)
      setState(next); setPresetCandidate(null); setCandidate(null); setPackCandidate(null); setBindings(null)
      setNotice(preset.name + '来陪你啦。角色选择已保存。'); interact('love')
    } catch { setError('角色没有保存成功，请重试。') }
    finally { setSaving(false) }
  }
  return <div className="pet-page">
    <header className="pet-page-header"><div><div className="pet-eyebrow"><PawPrint size={15}/> A LITTLE COMPANY</div><h1>把喜欢的它，放在桌边。</h1><p>带上它的动作，陪你认真，也陪你放松。</p></div><span className="pet-local-badge"><ShieldCheck size={15}/> 本地播放 · 无生成费用</span></header>
    {!desktop && <div className="pet-notice"><Monitor size={18}/> 这是桌宠功能预览。请在 MoneyDance 桌面版（Windows / macOS）中导入动作包并开启桌面陪伴。</div>}
    {(error || connectionError) && <div className="pet-error" role="alert">{error || connectionError}</div>}
    {notice && <p className="pet-save-notice" role="status"><Check size={15}/> {notice}</p>}
    <div className="pet-page-grid">
      <section className="pet-studio" aria-label="桌宠制作与动作预览">
        <div className="pet-section-title"><span className="pet-number">01</span><div><h2>认识你的桌边搭子</h2><p>选一位内置伙伴，或导入你自己的动作包</p></div></div>
        <div className="pet-preset-picker" role="group" aria-label="选择内置桌宠">{PET_PRESETS.map(item => {
          const selected = !previewPack && !previewImage && preset.id === item.id
          return <button key={item.id} className="pet-preset-card" aria-pressed={selected} disabled={busy || saving} onClick={() => previewPreset(item.id)}>
            <PetCharacter presetId={item.id} mood="working" reaction="love" size={94} reducedMotion/>
            <b>{item.name}<small>{item.species}</small></b><span>{item.personality}</span>
            <em>{selected ? presetCandidate ? '预览中' : '正在陪伴' : '看看它'}</em>
          </button>
        })}</div>
        {presetCandidate && <div className="pet-preset-adopt"><p>{preset.name} · 6 组动作，离线陪伴{state?.pack || state?.image ? '。确认后替换当前自定义桌宠，原始导入文件保留。' : ''}</p><div className="pet-button-row"><button className="pet-primary" disabled={!desktop || saving || busy} onClick={() => void adoptPreset()}>就选{preset.name}</button><button className="pet-text-button" disabled={saving || busy} onClick={() => void discard()}>取消预览</button></div></div>}
        <div className={`pet-preview-stage stage-${mood}`}>
          <span className="pet-stage-label">{candidate || packCandidate || presetCandidate ? '新桌宠 · 待确认' : previewPack ? previewPack.name : preset.name + ' · 动作预览'}</span>
          <div className="pet-preview-bubble">{reaction?.kind === 'love' ? '是你呀。把脸颊凑过来，蹭蹭你。' : reaction?.kind === 'celebrate' ? '这个小进步，值得举起两只爪爪庆祝！' : previewCopy[mood]}</div>
          <button className="pet-preview-touch" onClick={() => interact('love')} aria-label="摸摸桌宠，预览互动动作"><PetCharacter key={preset.id} presetId={preset.id} pack={previewPack} idlePreview={idlePreview} image={previewImage} mood={mood} size={210} reducedMotion={settings?.reducedMotion} reaction={reaction?.kind} replayKey={reaction?.id ?? replay} showCue/></button>
          <div className="pet-stage-ground"/><span className="pet-stage-caption"><MousePointer2 size={13}/> 点一下，给它一个摸摸</span>
        </div>
        <div className="pet-mood-picker" aria-label="预览动作">{moods.map(value => <button key={value} aria-pressed={mood === value && !reaction && !idlePreview} onClick={() => { setMood(value); setIdlePreview(false); setReaction(null); setReplay(value => value + 1) }}>{previewPack ? packStateLabels[value] : preset.labels[value]}</button>)}</div>
        <div className="pet-storyboard"><span className="pet-storyboard-label">{previewPack ? '你的素材，你的角色' : previewImage ? '照片场景模式' : '一段完整的小动作'}</span><p>{previewPack ? '播放动作包中的原有姿势，按计薪状态自动切换。摸摸和庆祝播完一次后返回；未提供的动作使用待机。' : previewImage ? '保留照片主体，搭配电脑、热饮、抱枕和小毯子的场景演出。想要完整肢体动作，请导入动作包。' : preset.stories[mood]}</p>
          <div className="pet-reaction-picker"><button aria-pressed={reaction?.kind === 'love'} onClick={() => interact('love')}>试试蹭蹭</button><button aria-pressed={reaction?.kind === 'celebrate'} onClick={() => interact('celebrate')}>庆祝一下</button><button onClick={() => { setReaction(null); setReplay(value => value + 1) }}>从头播放</button></div>
        </div>
        {previewPack && <section className="pet-pack-bindings" aria-label="动作包状态绑定"><div className="pet-pack-heading"><div><h3>{previewPack.name}</h3><p>{Object.keys(previewPack.clips).length} 组素材{previewPack.author ? ` · 作者 ${previewPack.author}` : ''}</p></div><button className="pet-secondary" aria-pressed={idlePreview} onClick={() => { setIdlePreview(true); setReaction(null); setReplay(value => value + 1) }}>预览待机</button></div>
          {(Object.keys(packStateLabels) as PackState[]).filter(value => value !== 'idle').map(value => <label className="pet-pack-binding" key={value}><span>{packStateLabels[value]}<small>{value === 'love' || value === 'celebrate' ? '播放一次' : '循环播放'}</small></span><select aria-label={`${packStateLabels[value]}对应动作`} disabled={saving || busy} value={previewPack.bindings[value]} onChange={event => { setBindings({ ...previewPack.bindings, [value]: event.target.value }); setReaction(null); setIdlePreview(false); if (moods.includes(value as PetMood)) setMood(value as PetMood); setReplay(x => x + 1) }}>{Object.entries(previewPack.clips).map(([key, clip]) => <option key={key} value={key}>{key === 'idle' ? '待机（缺省动作）' : key} · {clip.durations.length} 帧</option>)}</select></label>)}
          {previewPack.warnings.map((warning, i) => <p className="pet-pack-warning" key={i}>{warning}</p>)}
          {!packCandidate && <button className="pet-primary" disabled={saving || busy || JSON.stringify(previewPack.bindings) === JSON.stringify(state?.pack?.bindings)} onClick={() => void savePack()}>保存动作绑定</button>}
        </section>}
        <div className="pet-upload-area"><Upload size={22}/><h3>导入你的桌宠动作包</h3><p>ZIP 内放入 pet.json 和现成动作素材。<br/>支持 GIF / 动画 WebP / PNG 连续帧 / 精灵图 · 最大 25 MB</p>
          <div className="pet-button-row"><button className="pet-primary pet-import-pack" disabled={!desktop || busy || saving} onClick={() => void selectPack()}><Upload size={15}/> 选择 ZIP 动作包</button>{desktop ? <button className="pet-secondary" disabled={busy || saving} onClick={() => void template()}>保存示例模板</button> : <a className="pet-secondary" href="/pet-pack-template.zip" download>下载示例模板</a>}</div>
          {busy && <div className="pet-processing" role="status"><span className="pet-spinner"/>{progress}<button onClick={() => void desktop?.cancelExtraction()}>取消</button></div>}
          {(packCandidate || candidate) && <div className="pet-candidate-actions"><button className="pet-primary" disabled={saving || busy} onClick={() => void (packCandidate ? savePack() : adopt())}>就用它，放到桌面</button><button className="pet-text-button" disabled={saving || busy} onClick={() => void discard()}>放弃这次预览</button></div>}
          {(state?.image || state?.pack) && !candidate && !packCandidate && !presetCandidate && <button className="pet-text-button" disabled={busy || saving} onClick={() => previewPreset(settings?.presetId ?? 'xiaoxin')}>选择内置伙伴</button>}
          <details className="pet-photo-option"><summary>只有一张图片？使用简易照片陪伴</summary><p>单张图片只提供场景互动，不生成新姿势。PNG / JPG / WebP · 最大 15 MB</p><div className="pet-button-row"><button className="pet-secondary" disabled={!desktop || busy || saving} onClick={() => void selectImage('extract')}>选图并本地提取主体</button><button className="pet-secondary" disabled={!desktop || busy || saving} onClick={() => void selectImage('transparent')}>已有透明图片</button></div></details>
        </div>
        <div className="pet-how"><ShieldCheck size={18}/><p>导入、校验、播放都在本机完成，不上传素材、不调用 AI 生成服务。请使用你有权使用的素材。只需提供待机动作，就能开始陪伴；完整制作规范在模板内的说明文件中。</p></div>
      </section>
      <div className="pet-settings-column">
        <section className="pet-settings-card"><div className="pet-section-title"><span className="pet-number">02</span><div><h2>按你的节奏陪伴</h2><p>设置自动保存，随时都能调整</p></div></div>
          <fieldset disabled={!desktop || !settings || saving} className="pet-fieldset">
            <label className="pet-toggle-row"><span><b>在桌面显示</b><small>关闭主窗口后继续陪伴，可从托盘退出应用</small></span><input type="checkbox" checked={settings?.enabled ?? true} onChange={event => void update({ enabled: event.target.checked })}/></label>
            <div className="pet-form-row"><label>它的名字<input maxLength={20} value={name} onChange={event => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== settings?.name) void update({ name }); else if (!name.trim()) setName(settings?.name ?? '小薪') }}/></label><label>桌宠大小<select value={settings?.size ?? 160} onChange={event => void update({ size: Number(event.target.value) })}><option value={120}>小巧</option><option value={160}>刚刚好</option><option value={200}>大一点</option></select></label></div>
            <div className="pet-form-row"><label>收入汇报<select value={settings?.reportMinutes ?? 60} onChange={event => void update({ reportMinutes: Number(event.target.value) })}>{[0, 15, 30, 60, 120].map(value => <option key={value} value={value}>{value ? `每 ${value} 分钟` : '关闭自动汇报'}</option>)}</select></label><label>喝水 / 活动提醒<select value={settings?.breakMinutes ?? 50} onChange={event => void update({ breakMinutes: Number(event.target.value) })}>{[0, 30, 50, 60, 90].map(value => <option key={value} value={value}>{value ? `每 ${value} 分钟` : '关闭提醒'}</option>)}</select></label></div>
            <label className="pet-toggle-row"><span><b><Heart size={15}/> 暖心关怀</b><small>加班满一小时、持续加班和收工时送上关心</small></span><input type="checkbox" checked={settings?.warmth ?? true} onChange={event => void update({ warmth: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b><Sparkles size={15}/> 小小里程碑</b><small>计薪每跨过百元、首个心愿完成时轻轻庆祝</small></span><input type="checkbox" checked={settings?.milestones ?? true} onChange={event => void update({ milestones: event.target.checked })}/></label>
          </fieldset>
        </section>
        <section className="pet-settings-card"><div className="pet-section-title"><span className="pet-number">03</span><div><h2>温柔，也有边界</h2><p>安静陪伴，不催促你多工作</p></div></div>
          <fieldset disabled={!desktop || !settings || saving} className="pet-fieldset">
            <label className="pet-toggle-row"><span><b><Bell size={15}/> 定时免打扰</b><small>期间不自动弹出气泡、通知或语音</small></span><input type="checkbox" checked={settings?.quietEnabled ?? true} onChange={event => void update({ quietEnabled: event.target.checked })}/></label>
            {settings?.quietEnabled && <div className="pet-form-row"><label>开始时间<input type="time" value={settings.quietStart} onChange={event => void update({ quietStart: event.target.value })}/></label><label>结束时间<input type="time" value={settings.quietEnd} onChange={event => void update({ quietEnd: event.target.value })}/></label></div>}
            <label className="pet-toggle-row"><span><b><Eye size={15}/> 隐藏收入金额</b><small>共享屏幕时，桌宠和提醒不展示具体数额</small></span><input type="checkbox" checked={settings?.hideAmounts ?? false} onChange={event => void update({ hideAmounts: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b><Volume2 size={15}/> 语音读出提醒</b><small>使用系统语音，默认关闭</small></span><input type="checkbox" checked={settings?.speech ?? false} onChange={event => void update({ speech: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b>系统通知</b><small>默认只用桌宠气泡；系统通知遵循系统设置</small></span><input type="checkbox" checked={settings?.notifications ?? false} onChange={event => void update({ notifications: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b>减少动作</b><small>保留陪伴，停止循环动画</small></span><input type="checkbox" checked={settings?.reducedMotion ?? false} onChange={event => void update({ reducedMotion: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b>登录电脑后启动</b><small>安装版生效，默认关闭</small></span><input type="checkbox" checked={settings?.launchAtLogin ?? false} onChange={event => void update({ launchAtLogin: event.target.checked })}/></label>
          </fieldset>
        </section>
        <div className="pet-tip"><Coffee size={21}/><div><b>一点陪伴，很多种回应</b><p>拖动桌宠调整位置；点击摸摸、查看收入，或开始 25 分钟专注。摸鱼与加班入口会打开原有记录页面。</p></div></div>
      </div>
    </div>
  </div>
}
