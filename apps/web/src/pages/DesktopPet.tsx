import { useEffect, useState } from 'react'
import { Bell, Check, Coffee, Eye, Heart, Monitor, MousePointer2, PawPrint, ShieldCheck, Sparkles, Upload, Volume2 } from 'lucide-react'
import { desktop, type PetMood, type PetSettings } from '../lib/desktop'
import { useDesktopState } from '../lib/useDesktopState'
import { PetCharacter, moodLabels } from '../pet/PetCharacter'
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
  const [mood, setMood] = useState<PetMood>('working')
  const [candidate, setCandidate] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [name, setName] = useState('小薪'), [happy, setHappy] = useState(false)
  useEffect(() => { if (state) setName(state.settings.name) }, [state?.settings.name])
  useEffect(() => {
    const off = desktop?.onProgress(setProgress)
    return () => { off?.(); void desktop?.cancelExtraction().catch(() => undefined) }
  }, [])
  useEffect(() => { if (!happy) return; const timer = setTimeout(() => setHappy(false), 1800); return () => clearTimeout(timer) }, [happy])
  const settings = state?.settings
  async function update(changes: Partial<PetSettings>) {
    if (!desktop || !settings || saving) return
    setSaving(true); setError(''); setNotice('')
    try { const next = await desktop.saveSettings({ ...settings, ...changes }); setState(next); setNotice('已保存，下次打开仍会陪着你。') }
    catch { setError('设置没有保存成功，请重试。') }
    finally { setSaving(false) }
  }
  async function selectImage(mode: 'extract' | 'transparent') {
    if (!desktop) return
    setBusy(true); setProgress('请选择一张照片…'); setError(''); setNotice(''); setCandidate(null)
    try { const result = await desktop.createPet(mode); if (result) { setCandidate(result); setNotice('主体准备好了，切换下面的状态看看动作。') } }
    catch (error) { setError(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '')) }
    finally { setBusy(false); setProgress('') }
  }
  async function adopt() {
    if (!desktop) return
    setSaving(true); setError('')
    try { setState(await desktop.usePet()); setCandidate(null); setNotice('你的专属桌宠已经来到桌面啦！'); setHappy(true) }
    catch { setError('桌宠没有保存成功，请重新选择图片。') }
    finally { setSaving(false) }
  }
  async function reset() {
    if (!desktop || !window.confirm('换回小薪？当前自定义桌宠会被替换，原始照片不会删除。')) return
    try { setState(await desktop.resetPet()); setCandidate(null); setNotice('小薪回来啦。') } catch { setError('替换失败，请重试。') }
  }
  return <div className="pet-page">
    <header className="pet-page-header"><div><div className="pet-eyebrow"><PawPrint size={15}/> A LITTLE COMPANY</div><h1>把喜欢的它，放在桌边。</h1><p>陪你认真，也陪你放松。让每一天的付出，都有温柔的回应。</p></div><span className="pet-local-badge"><ShieldCheck size={15}/> 照片只在本机处理</span></header>
    {!desktop && <div className="pet-notice"><Monitor size={18}/> 这是桌宠功能预览。请在 MoneyDance Windows 版中上传照片并开启桌面陪伴。</div>}
    {(error || connectionError) && <div className="pet-error" role="alert">{error || connectionError}</div>}
    {notice && <p className="pet-save-notice" role="status"><Check size={15}/> {notice}</p>}
    <div className="pet-page-grid">
      <section className="pet-studio" aria-label="桌宠制作与动作预览">
        <div className="pet-section-title"><span className="pet-number">01</span><div><h2>认识你的桌边搭子</h2><p>一张照片，就能开始一段陪伴</p></div></div>
        <div className={`pet-preview-stage stage-${mood}`}>
          <span className="pet-stage-label">{candidate ? '新桌宠 · 待确认' : '动作预览'}</span>
          <div className="pet-preview-bubble">{happy ? '收到你的摸摸啦，今天也一起慢慢来。' : previewCopy[mood]}</div>
          <button className="pet-preview-touch" onClick={() => setHappy(true)} aria-label="摸摸桌宠，预览开心动作"><PetCharacter image={candidate || state?.image} mood={mood} size={200} reducedMotion={settings?.reducedMotion} happy={happy}/></button>
          <div className="pet-stage-ground"/><span className="pet-stage-caption"><MousePointer2 size={13}/> 点一下，给它一个摸摸</span>
        </div>
        <div className="pet-mood-picker" aria-label="预览动作">{moods.map(value => <button key={value} aria-pressed={mood === value} onClick={() => setMood(value)}>{moodLabels[value]}</button>)}</div>
        <div className="pet-upload-area"><Upload size={22}/><h3>{state?.image ? '想换一位新搭子？' : '用你喜欢的照片制作桌宠'}</h3><p>宠物、玩偶、手绘角色都可以。单一主体、清晰背景效果更好。<br/>PNG / JPG / WebP · 最大 15 MB</p>
          <div className="pet-button-row"><button className="pet-primary" disabled={!desktop || busy || saving} onClick={() => void selectImage('extract')}><Sparkles size={15}/> 选图并自动提取主体</button><button className="pet-secondary" disabled={!desktop || busy || saving} onClick={() => void selectImage('transparent')}>已有透明图片</button></div>
          {busy && <div className="pet-processing" role="status"><span className="pet-spinner"/>{progress}<button onClick={() => void desktop?.cancelExtraction()}>取消</button></div>}
          {candidate && <div className="pet-candidate-actions"><button className="pet-primary" disabled={saving} onClick={() => void adopt()}>就用它，放到桌面</button><button className="pet-text-button" disabled={saving} onClick={() => setCandidate(null)}>放弃这次预览</button></div>}
          {state?.image && !candidate && <button className="pet-text-button" disabled={busy || saving} onClick={() => void reset()}>换回默认小薪</button>}
        </div>
        <div className="pet-how"><ShieldCheck size={18}/><p>安装包已包含主体识别模型，全程离线。动作通过轻摆、呼吸、点头和跳跃实现；复杂背景的抠图效果可能有差异，可以换图或使用透明 PNG。</p></div>
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
            <label className="pet-toggle-row"><span><b>Windows 系统通知</b><small>默认只用桌宠气泡；系统通知遵循 Windows 设置</small></span><input type="checkbox" checked={settings?.notifications ?? false} onChange={event => void update({ notifications: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b>减少动作</b><small>保留陪伴，停止循环动画</small></span><input type="checkbox" checked={settings?.reducedMotion ?? false} onChange={event => void update({ reducedMotion: event.target.checked })}/></label>
            <label className="pet-toggle-row"><span><b>登录 Windows 后启动</b><small>安装版生效，默认关闭</small></span><input type="checkbox" checked={settings?.launchAtLogin ?? false} onChange={event => void update({ launchAtLogin: event.target.checked })}/></label>
          </fieldset>
        </section>
        <div className="pet-tip"><Coffee size={21}/><div><b>一点陪伴，很多种回应</b><p>拖动桌宠调整位置；点击摸摸、查看收入，或开始 25 分钟专注。摸鱼与加班入口会打开原有记录页面。</p></div></div>
      </div>
    </div>
  </div>
}
