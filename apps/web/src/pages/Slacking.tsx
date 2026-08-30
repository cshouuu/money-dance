import { calculateRates, formatDuration, slackingEarned } from '@salary-flow/core'
import { Fish, Play, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AchievementPanel } from '../components/AchievementPanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FinishToast } from '../components/FinishToast'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import {
  elapsedSecondsSince,
  formatTimerDuration,
  loadAchievementState,
  reconcileAchievementSessions,
  saveAchievementState,
} from '../lib/achievements'
import { createId } from '../lib/id'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, removeJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import { prepareSlackingWebStop } from '../lib/widgetActions'
import type { SlackingSession } from '../types'
import './Slacking.css'

type PendingDelete = { type: 'all' } | { type: 'session'; session: SlackingSession } | null

export function Slacking() {
  const [profile] = useState(() => loadProfile())
  const rate = useMemo(() => calculateRates(profile).second, [profile])
  const now = useNow(1000)
  const [active, setActive] = useState<string | null>(() => loadJSON<string | null>(keys.activeSlacking, null))
  const [sessions, setSessions] = useState<SlackingSession[]>(() => loadJSON<SlackingSession[]>(keys.sessions, []))
  const [achievementState, setAchievementState] = useState(() => reconcileAchievementSessions(
    'slacking',
    loadAchievementState('slacking'),
    sessions,
    new Date().toISOString(),
  ))
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [finishNotice, setFinishNotice] = useState<{ id: string; message: string } | null>(null)
  const [achievementSaveFailed, setAchievementSaveFailed] = useState(false)
  const stoppingRef = useRef(false)

  const currentPage = Math.min(page, getPageCount(sessions.length))
  const visibleSessions = getPageItems(sessions, currentPage)
  const liveSeconds = active ? elapsedSecondsSince(active, now) : 0
  const liveMoney = liveSeconds * rate
  const totalMoney = useMemo(() => sessions.reduce((total, session) => total + session.earnedAmount, 0), [sessions])
  const totalSeconds = useMemo(() => sessions.reduce((total, session) => total + session.durationSeconds, 0), [sessions])
  useEffect(() => {
    setAchievementState(current => reconcileAchievementSessions('slacking', current, sessions, new Date().toISOString()))
  }, [sessions])

  useEffect(() => {
    setAchievementSaveFailed(!saveAchievementState('slacking', achievementState))
  }, [achievementState])

  const start = useCallback(() => {
    const startTime = new Date().toISOString()
    setActive(startTime)
    saveJSON(keys.activeSlacking, startTime)
  }, [])

  const stop = useCallback(() => {
    if (!active || stoppingRef.current) return
    stoppingRef.current = true
    try {
      // The native widget journal can finish this timer before React receives
      // the resulting reload. Re-read localStorage at the write boundary so a
      // stale page click cannot overwrite or duplicate the native session.
      const latest = prepareSlackingWebStop(active)
      if (!latest.shouldStop) {
        const expectedStartAt = new Date(active).getTime()
        const storedActiveMatches = latest.active !== null
          && new Date(latest.active).getTime() === expectedStartAt
        if (latest.completedSession && storedActiveMatches) removeJSON(keys.activeSlacking)
        setActive(latest.completedSession && storedActiveMatches ? null : latest.active)
        setSessions(latest.sessions)
        setPage(1)
        return
      }
      const endTime = new Date().toISOString()
      const startTime = latest.active ?? active
      const durationSeconds = elapsedSecondsSince(startTime, new Date(endTime))
      const session: SlackingSession = {
        id: createId(),
        startTime,
        endTime,
        durationSeconds,
        earnedAmount: slackingEarned(startTime, endTime, rate),
      }
      const next = [session, ...latest.sessions]
      const nextAchievementState = reconcileAchievementSessions(
        'slacking',
        achievementState,
        [session],
        endTime,
      )
      setActive(null)
      setSessions(next)
      setAchievementState(nextAchievementState)
      setPage(1)
      removeJSON(keys.activeSlacking)
      saveJSON(keys.sessions, next)
      setAchievementSaveFailed(!saveAchievementState('slacking', nextAchievementState))
      setFinishNotice({ id: session.id, message: `才赚了¥${session.earnedAmount.toFixed(2)}，这就不摸了？` })
    } finally {
      stoppingRef.current = false
    }
  }, [active, achievementState, rate])

  const closeFinishNotice = useCallback(() => setFinishNotice(null), [])
  const cancelDelete = useCallback(() => setPendingDelete(null), [])
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const reconciled = reconcileAchievementSessions(
      'slacking',
      achievementState,
      sessions,
      new Date().toISOString(),
    )
    if (!saveAchievementState('slacking', reconciled)) {
      setAchievementSaveFailed(true)
      setPendingDelete(null)
      return
    }
    setAchievementState(reconciled)
    setAchievementSaveFailed(false)
    if (pendingDelete.type === 'all') {
      setSessions([])
      saveJSON(keys.sessions, [])
      setPage(1)
    } else {
      const next = sessions.filter(session => session.id !== pendingDelete.session.id)
      setSessions(next)
      saveJSON(keys.sessions, next)
    }
    setPendingDelete(null)
  }, [achievementState, pendingDelete, sessions])

  return <section className="page">
    <header className="page-header"><div><p className="eyebrow">SLACKING TIMER</p><h1>摸鱼，也要有收益感。</h1><p>计时基于真实时间戳，刷新、锁屏、切换页面都不会让时间丢失。</p></div></header>
    <div className={`timer-card ${active ? 'running' : ''}`}>
      <div className="fish-orbit"><Fish size={34}/></div>
      <p>{active ? '正在摸鱼……' : '今天准备摸一会儿？'}</p>
      <div className="timer-number">{active ? formatTimerDuration(liveSeconds) : '00:00:00'}</div>
      <small>老板已为这段时间支付</small>
      <div className="timer-money">¥{liveMoney.toFixed(2)}</div>
      {active ? <button type="button" className="stop-button" onClick={stop}><Square size={18}/>结束摸鱼</button> : <button type="button" className="primary-button big" onClick={start}><Play size={18}/>开始摸鱼</button>}
      <span className="timer-rate">+ ¥{rate.toFixed(5)} / 秒</span>
    </div>
    <div className="summary-strip slacking-summary"><div><small>历史摸鱼收益</small><strong>¥{totalMoney.toFixed(2)}</strong></div><div><small>当前保留的摸鱼时间</small><strong>{formatDuration(totalSeconds)}</strong></div><button type="button" className="text-button clear-slacking-button" disabled={sessions.length === 0} onClick={() => setPendingDelete({ type: 'all' })}><Trash2 size={15}/>清空历史</button></div>
    <AchievementPanel kind="slacking" state={achievementState} activeSeconds={liveSeconds} saveFailed={achievementSaveFailed}/>
    <div className="list-section"><div className="section-title"><h2>摸鱼记录</h2><span>{sessions.length} 次</span></div>{sessions.length === 0 ? <div className="empty">还没有摸鱼记录。</div> : <><div className="item-list">{visibleSessions.map(session => <article className="list-card slacking-record" key={session.id}><div className="item-avatar fish">🐟</div><div className="item-main"><b>{new Date(session.startTime).toLocaleDateString('zh-CN')} {new Date(session.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</b><span>{formatDuration(session.durationSeconds)}</span></div><div className="item-result"><small>本次摸鱼</small><strong>¥{session.earnedAmount.toFixed(2)}</strong></div><button className="icon-button slacking-delete-button" type="button" onClick={() => setPendingDelete({ type: 'session', session })} aria-label="删除这次摸鱼记录" title="删除"><Trash2 size={16}/></button></article>)}</div><Pagination total={sessions.length} page={currentPage} onPageChange={setPage}/></>}</div>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.type === 'all' ? '你要悄悄地删掉全部摸鱼记录吗？' : '你要悄悄地删掉这次摸鱼记录吗？'} message={pendingDelete ? `${pendingDelete.type === 'session' ? `${new Date(pendingDelete.session.startTime).toLocaleString('zh-CN')} · ¥${pendingDelete.session.earnedAmount.toFixed(2)}。` : ''}计时记录会被删除，但已点亮勋章和成就累计时长会永久保留。` : undefined} confirmLabel="对，打枪的不要" cancelLabel="不，我光明正大" onConfirm={confirmDelete} onCancel={cancelDelete}/>
    {finishNotice ? <FinishToast key={finishNotice.id} message={finishNotice.message} onClose={closeFinishNotice}/> : null}
  </section>
}
