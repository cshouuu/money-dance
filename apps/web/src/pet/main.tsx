import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { desktop, type PetAction, type PetWindowLayout } from '../lib/desktop'
import { useDesktopState } from '../lib/useDesktopState'
import { PetCharacter } from './PetCharacter'
import { getPetPreset } from './presets'
import { type PetReaction } from './motion'
import { reactionDuration, packStateLabels } from './pack-motion'
import { petPixelAt } from './hit-test'
import './pet-window.css'

function PetWindow() {
  const { state, error } = useDesktopState()
  const [now, setNow] = useState(Date.now()), [menu, setMenu] = useState(false), [actionError, setActionError] = useState('')
  const [reaction, setReaction] = useState<PetReaction | null>(null)
  const [layout, setLayout] = useState<PetWindowLayout | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const spoken = useRef<string | null>(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    let lastPoint: { x: number; y: number } | null = null
    const refresh = () => {
      if (!lastPoint) return
      const target = document.elementFromPoint(lastPoint.x, lastPoint.y)?.closest('[data-interactive]')
      desktop?.setInteractive(!!pointer.current || !!target && (!target.classList.contains('pet-drag-target') || petPixelAt(target, lastPoint.x, lastPoint.y, refresh)))
    }
    const hitTest = (event: MouseEvent) => { lastPoint = { x: event.clientX, y: event.clientY }; refresh() }
    const leave = () => { if (!pointer.current) desktop?.setInteractive(false); lastPoint = null }
    document.addEventListener('mousemove', hitTest)
    document.addEventListener('mouseleave', leave)
    const observer = new MutationObserver(refresh)
    observer.observe(document.getElementById('root')!, { subtree: true, attributes: true, attributeFilter: ['viewBox', 'x', 'y', 'href'] })
    desktop?.setInteractive(false)
    return () => { observer.disconnect(); document.removeEventListener('mousemove', hitTest); document.removeEventListener('mouseleave', leave); window.speechSynthesis?.cancel() }
  }, [])
  const message = state?.message, settings = state?.settings
  const reactionKind = message?.kind === 'love' || message?.kind === 'celebrate' ? message.kind : null
  const reactionMs = reactionKind ? reactionDuration(state?.pack, reactionKind) : 0
  useEffect(() => {
    const remaining = message ? reactionMs - (Date.now() - message.at) : 0
    if (!reactionKind || remaining <= 0) { setReaction(null); return }
    setReaction(reactionKind)
    const timer = setTimeout(() => setReaction(null), remaining)
    return () => clearTimeout(timer)
  }, [message?.id, state?.pack?.id, reactionMs, reactionKind])
  useEffect(() => {
    if (!settings?.speech || settings.hideAmounts) { window.speechSynthesis?.cancel(); return }
    if (!message || message.id === spoken.current || Date.now() - message.at > 15_000 || !window.speechSynthesis) return
    spoken.current = message.id
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message.text)
    utterance.lang = 'zh-CN'; utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  }, [message?.id, settings?.speech, settings?.hideAmounts])
  const showMessage = !!message && now - message.at < 12_000
  const panelKey = menu ? 'menu' : showMessage || actionError ? 'bubble' : ''
  useEffect(() => desktop?.onLayout(setLayout), [])
  useLayoutEffect(() => {
    if (!desktop || !bodyRef.current) return
    let disposed = false, previous = ''
    const measure = () => {
      const body = bodyRef.current, panel = panelRef.current
      if (!body) return
      const metrics = { bodyWidth: body.offsetWidth, bodyHeight: body.offsetHeight, panelWidth: panel?.offsetWidth || 0, panelHeight: panel?.offsetHeight || 0 }
      const identity = JSON.stringify(metrics)
      if (identity === previous) return
      previous = identity
      void desktop!.layout(metrics).then(next => { if (!disposed) setLayout(next) }).catch(() => { if (!disposed) setActionError('桌宠布局未更新，请重新打开应用。') })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(bodyRef.current)
    if (panelRef.current) observer.observe(panelRef.current)
    measure()
    return () => { disposed = true; observer.disconnect() }
  }, [!!state, settings?.size, panelKey])
  if (!desktop) return <div className="pet-fallback">请在 Windows 版中打开桌宠。</div>
  if (!state || !settings) return <div className="pet-fallback">{error || '小薪正在过来…'}</div>
  const snapshot = state.snapshot, fresh = snapshot && now - snapshot.updatedAt < 15_000
  const mood = fresh ? snapshot.state : 'rest'
  const focusSeconds = Math.max(0, Math.ceil((state.focusEndsAt - now) / 1000))
  const snoozed = state.snoozedUntil > now
  async function action(value: PetAction) { setActionError(''); try { await desktop!.action(value) } catch { setActionError('刚刚没有成功，再试一下吧。') } }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !petPixelAt(event.currentTarget, event.clientX, event.clientY)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = { x: event.screenX, y: event.screenY, moved: false }
    desktop!.drag('start')
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!pointer.current) return
    if (Math.abs(event.screenX - pointer.current.x) + Math.abs(event.screenY - pointer.current.y) > 5) pointer.current.moved = true
    if (pointer.current.moved) desktop!.drag('move')
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!pointer.current) return
    const moved = pointer.current.moved; pointer.current = null
    desktop!.drag('end')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!moved && event.type !== 'pointercancel') void action('pet')
  }
  const panelStyle = { left: layout?.panel?.x ?? 0, top: layout?.panel?.y ?? 0, visibility: layout?.panel ? 'visible' as const : 'hidden' as const }
  return <main className="pet-floating" aria-label={`${settings.name}，你的桌面伙伴`}>
    {!menu && (showMessage || actionError) && <div ref={panelRef} style={panelStyle} className="pet-live-bubble" data-placement={layout?.placement} role="status" data-interactive>{actionError || message?.text}</div>}
    {menu && <div ref={panelRef} style={panelStyle} className="pet-popup" data-interactive aria-label="桌宠快捷操作">
      <button onClick={() => { void desktop!.openPage('/'); setMenu(false) }}>打开 MoneyDance</button>
      <button onClick={() => { void desktop!.openPage('/slacking'); setMenu(false) }}>摸鱼记录</button>
      <button onClick={() => { void desktop!.openPage('/overtime'); setMenu(false) }}>加班记录</button>
      <button onClick={() => { void action(focusSeconds ? 'cancel-focus' : 'focus'); setMenu(false) }}>{focusSeconds ? '结束专注计时' : '专注 25 分钟'}</button>
      <button onClick={() => { void action(snoozed ? 'unsnooze' : 'snooze'); setMenu(false) }}>{snoozed ? '恢复提醒' : '安静陪伴 30 分钟'}</button>
      <button onClick={() => { void desktop!.openPage('/pet'); setMenu(false) }}>装扮与提醒设置</button>
      <button onClick={() => void action('hide')}>隐藏桌宠 · 托盘可找回</button>
    </div>}
    <div ref={bodyRef} className="pet-floating-body" style={{ left: layout?.body.x ?? 0, top: layout?.body.y ?? 0 }}>
      <button className="pet-drag-target" data-interactive aria-label={`摸摸${settings.name}，按住拖动位置`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void action('pet') } }} onContextMenu={event => { event.preventDefault(); setMenu(value => !value) }}>
        <PetCharacter key={settings.presetId} presetId={settings.presetId} pack={state.pack} image={state.image} mood={mood} size={settings.size} reducedMotion={settings.reducedMotion} reaction={reaction} replayKey={reaction || message?.kind === 'warmth' ? message?.id : 0}/>
      </button>
      <div className="pet-toolbar" data-interactive>
        <button onClick={() => void action('report')} title="汇报当前计薪"><span className="pet-live-dot"/>{fresh ? settings.hideAmounts ? state.pack ? packStateLabels[mood] : getPetPreset(settings.presetId).labels[mood] : `¥${snapshot.workAmount.toFixed(2)}` : '正在对表'}</button>
        <button onClick={() => setMenu(value => !value)} aria-label="桌宠菜单" aria-expanded={menu}>•••</button>
      </div>
      {(focusSeconds > 0 || snoozed) && <div className="pet-mini-status">{focusSeconds > 0 ? `专注 ${Math.floor(focusSeconds / 60)}:${String(focusSeconds % 60).padStart(2, '0')}` : '安静陪伴中'}</div>}
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<PetWindow/> )
