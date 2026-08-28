import { calculateRates, formatDuration } from '@salary-flow/core'
import { BadgeDollarSign, BriefcaseBusiness, Play, Square, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { OvertimeStartDialog } from '../components/OvertimeStartDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { loadLedger, saveLedger } from '../lib/ledger'
import { calculateOvertimeEarnings, overtimePayLabel } from '../lib/overtime'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import type { ActiveOvertime, OvertimeSession, OvertimeStartOption } from '../types'
import './Overtime.css'

type PendingDelete = { type: 'all' } | { type: 'session'; session: OvertimeSession } | null

function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatStart(value: string): string {
  const date = new Date(value)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

export function Overtime() {
  const [profile] = useState(() => loadProfile())
  const rates = useMemo(() => calculateRates(profile), [profile])
  const now = useNow(250)
  const [active, setActive] = useState<ActiveOvertime | null>(() => loadJSON<ActiveOvertime | null>(keys.activeOvertime, null))
  const [sessions, setSessions] = useState<OvertimeSession[]>(() => loadJSON<OvertimeSession[]>(keys.overtimeSessions, []))
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [page, setPage] = useState(1)

  const liveSeconds = active ? Math.max(0, (now.getTime() - new Date(active.startTime).getTime()) / 1000) : 0
  const liveMoney = active ? calculateOvertimeEarnings(active, liveSeconds, rates.second) : 0
  const currentPage = Math.min(page, getPageCount(sessions.length))
  const visibleSessions = getPageItems(sessions, currentPage)
  const totalSeconds = sessions.reduce((total, session) => total + session.durationSeconds, 0)
  const totalMoney = sessions.reduce((total, session) => total + session.earnedAmount, 0)

  const openStartDialog = useCallback(() => setStartDialogOpen(true), [])
  const closeStartDialog = useCallback(() => setStartDialogOpen(false), [])
  const cancelDelete = useCallback(() => setPendingDelete(null), [])
  const start = useCallback((option: OvertimeStartOption) => {
    const next: ActiveOvertime = { ...option, startTime: new Date().toISOString() }
    setActive(next)
    saveJSON(keys.activeOvertime, next)
    setStartDialogOpen(false)
  }, [])

  const stop = useCallback(() => {
    if (!active) return
    const endTime = new Date().toISOString()
    const durationSeconds = Math.max(0, (new Date(endTime).getTime() - new Date(active.startTime).getTime()) / 1000)
    const session: OvertimeSession = {
      ...active,
      id: crypto.randomUUID(),
      endTime,
      durationSeconds,
      earnedAmount: calculateOvertimeEarnings(active, durationSeconds, rates.second),
    }
    const next = [session, ...sessions]
    setSessions(next)
    saveJSON(keys.overtimeSessions, next)
    if (session.earnedAmount > 0) {
      const ledger = loadLedger()
      saveLedger([{ id: crypto.randomUUID(), kind: 'overtime', direction: 'income', amount: session.earnedAmount, source: `加班收入 · ${overtimePayLabel(session)}`, occurredAt: endTime, linkedId: session.id }, ...ledger])
    }
    setActive(null)
    saveJSON(keys.activeOvertime, null)
    setPage(1)
  }, [active, rates.second, sessions])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const removed = pendingDelete.type === 'all' ? sessions : [pendingDelete.session]
    const removedIds = new Set(removed.map(session => session.id))
    const next = pendingDelete.type === 'all' ? [] : sessions.filter(session => !removedIds.has(session.id))
    setSessions(next)
    saveJSON(keys.overtimeSessions, next)
    saveLedger(loadLedger().filter(entry => entry.kind !== 'overtime' || !entry.linkedId || !removedIds.has(entry.linkedId)))
    setPage(1)
    setPendingDelete(null)
  }, [pendingDelete, sessions])

  return <section className="page overtime-page">
    <header className="page-header"><div><p className="eyebrow">OVERTIME TIMER</p><h1>加班，也得算得明白。</h1><p>有钱就算钱，没钱也把时间记下来。刷新、锁屏或切换页面都不会丢失计时。</p></div></header>

    <div className={`timer-card overtime-timer${active ? ' running' : ''}`}>
      <div className="overtime-orbit"><BriefcaseBusiness size={32}/></div>
      <p>{active ? '正在加班……' : '今天又要加班吗？'}</p>
      <div className="timer-number">{active ? formatTimer(liveSeconds) : '00:00:00'}</div>
      <small>{active?.payMode === 'unpaid' ? '这段时间没有加班费' : '本次预计加班收入'}</small>
      <div className="timer-money">¥{liveMoney.toFixed(2)}</div>
      {active ? <button type="button" className="stop-button" onClick={stop}><Square size={18}/>结束加班</button> : <button type="button" className="primary-button big" onClick={openStartDialog}><Play size={18}/>开始加班</button>}
      <span className="timer-rate">{active ? active.payMode === 'unpaid' ? '只计时间 · 不计收入' : active.payMode === 'fixed' ? `本次固定加班费 ¥${(active.fixedAmount ?? 0).toFixed(2)}` : `+ ¥${(rates.second * (active.multiplier ?? 1)).toFixed(5)} / 秒 · ${active.multiplier ?? 1} 倍工资` : '开始时再选择有没有加班费'}</span>
    </div>

    <div className="summary-strip overtime-summary"><div><small>历史加班收入</small><strong>¥{totalMoney.toFixed(2)}</strong></div><div><small>历史加班时间</small><strong>{formatDuration(totalSeconds)}</strong></div><button type="button" className="text-button clear-overtime-button" disabled={sessions.length === 0} onClick={() => setPendingDelete({ type: 'all' })}><Trash2 size={15}/>清空历史</button></div>

    <div className="list-section"><div className="section-title"><h2>加班记录</h2><span>{sessions.length} 次</span></div>{sessions.length === 0 ? <div className="empty">还没有加班记录。</div> : <><div className="item-list">{visibleSessions.map(session => <article className="list-card overtime-record" key={session.id}><div className="item-avatar overtime-avatar"><BadgeDollarSign size={19}/></div><div className="item-main"><b>{formatStart(session.startTime)}</b><span>{formatDuration(session.durationSeconds)} · {overtimePayLabel(session)}</span></div><div className="item-result"><small>本次加班</small><strong>¥{session.earnedAmount.toFixed(2)}</strong></div><button className="icon-button overtime-delete-button" type="button" onClick={() => setPendingDelete({ type: 'session', session })} aria-label="删除这次加班记录" title="删除"><Trash2 size={16}/></button></article>)}</div><Pagination total={sessions.length} page={currentPage} onPageChange={setPage}/></>}</div>

    <OvertimeStartDialog open={startDialogOpen} onStart={start} onCancel={closeStartDialog}/>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.type === 'all' ? '这些加班证据也要全部删掉吗？' : '真的要删掉这次加班记录吗？'} message={pendingDelete?.type === 'session' ? `${formatStart(pendingDelete.session.startTime)} · ${overtimePayLabel(pendingDelete.session)} · ¥${pendingDelete.session.earnedAmount.toFixed(2)}` : undefined} confirmLabel="删掉，当没加过" cancelLabel="留着，都是证据" onConfirm={confirmDelete} onCancel={cancelDelete}/>
  </section>
}
