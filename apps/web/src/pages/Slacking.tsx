import { calculateRates, formatDuration, slackingEarned } from '@salary-flow/core'
import { History, Play, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AchievementPanel } from '../components/AchievementPanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FinishToast } from '../components/FinishToast'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { SlackingTimeDialog } from '../components/SlackingTimeDialog'
import {
  elapsedSecondsSince,
  formatTimerDuration,
  getAchievementSnapshot,
  loadAchievementState,
  reconcileAchievementSessions,
  saveAchievementState,
} from '../lib/achievements'
import { loadProfile } from '../lib/profile'
import { createCompletedSlackingSession, hasOverlappingSlacking, loadActiveSlacking, loadSlackingSessions, type CompletedSlackingInput } from '../lib/slacking'
import { resolveSessionStartBusinessDate } from '../lib/sessionBusinessDate'
import { keys, loadJSON, removeJSON, saveJSON } from '../lib/storage'
import { runReversibleStorageTransaction } from '../lib/storageTransaction'
import { createWebTimerSessionId, sameTimerStart, upsertTimerSession } from '../lib/timerStop'
import { useNow } from '../lib/useNow'
import { prepareSlackingWebStop } from '../lib/widgetActions'
import type { ActiveSlacking, SlackingSession } from '../types'
import './Slacking.css'

type PendingDelete = { type: 'all' } | { type: 'session'; session: SlackingSession } | null
type TimeDialogPurpose = 'start' | 'backfill' | null

const SLACKING_VISUALS = [
  { emoji: '🐟', label: '小鱼试水' },
  { emoji: '🐠', label: '鱼塘常客' },
  { emoji: '🐡', label: '大鱼出没' },
  { emoji: '🦈', label: '大鲨鱼' },
  { emoji: '🧜‍♀️', label: '摸鱼美人鱼' },
] as const

function slackingVisualByLevel(level: number) {
  return SLACKING_VISUALS[Math.min(SLACKING_VISUALS.length - 1, Math.max(0, Math.floor(level)))]!
}

function slackingSessionVisual(durationSeconds: number) {
  if (durationSeconds >= 2 * 3600) return SLACKING_VISUALS[4]
  if (durationSeconds >= 3600) return SLACKING_VISUALS[3]
  if (durationSeconds >= 30 * 60) return SLACKING_VISUALS[2]
  if (durationSeconds >= 10 * 60) return SLACKING_VISUALS[1]
  return SLACKING_VISUALS[0]
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

export function Slacking() {
  const [profile] = useState(() => loadProfile())
  const rate = useMemo(() => calculateRates(profile).second, [profile])
  const now = useNow(1000)
  const [active, setActive] = useState<ActiveSlacking | null>(loadActiveSlacking)
  const [sessions, setSessions] = useState<SlackingSession[]>(loadSlackingSessions)
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
  const [timeDialogPurpose, setTimeDialogPurpose] = useState<TimeDialogPurpose>(null)
  const [stopError, setStopError] = useState('')
  const [pendingRepairStart, setPendingRepairStart] = useState<string | null>(null)
  const stoppingRef = useRef(false)

  const currentPage = Math.min(page, getPageCount(sessions.length))
  const visibleSessions = getPageItems(sessions, currentPage)
  const liveSeconds = active ? elapsedSecondsSince(active.startTime, now) : 0
  const liveMoney = liveSeconds * rate
  const totalMoney = useMemo(() => sessions.reduce((total, session) => total + session.earnedAmount, 0), [sessions])
  const totalSeconds = useMemo(() => sessions.reduce((total, session) => total + session.durationSeconds, 0), [sessions])
  const achievementSnapshot = getAchievementSnapshot('slacking', achievementState, liveSeconds)
  const timerVisual = slackingVisualByLevel(achievementSnapshot.highestLevel)
  useEffect(() => {
    setAchievementState(current => reconcileAchievementSessions('slacking', current, sessions, new Date().toISOString()))
  }, [sessions])

  useEffect(() => {
    setAchievementSaveFailed(!saveAchievementState('slacking', achievementState))
  }, [achievementState])

  const start = useCallback((startTime: string): string | null => {
    if (pendingRepairStart) return '上一次摸鱼记录尚未完成同步，请先点击“重试保存”。'
    const nowTime = new Date().toISOString()
    const startAt = new Date(startTime).getTime()
    if (!Number.isFinite(startAt) || startAt > new Date(nowTime).getTime()) return '实际开始时间不能晚于现在。'
    const storedActive = loadActiveSlacking()
    if (storedActive) {
      setActive(storedActive)
      return '已有一段摸鱼正在计时，请先结束后再开始。'
    }
    const storedSessions = loadSlackingSessions()
    if (hasOverlappingSlacking(storedSessions, startTime, nowTime)) return '这段时间与已有摸鱼记录重叠，请换一个开始时间。'
    const businessDate = resolveSessionStartBusinessDate(startTime)
    if (!businessDate) return '请选择有效的实际开始时间。'
    const next: ActiveSlacking = { startTime, ...businessDate }
    if (!saveJSON(keys.activeSlacking, next)) return '保存失败，请检查浏览器存储空间后重试。'
    setActive(next)
    setTimeDialogPurpose(null)
    return null
  }, [pendingRepairStart, sessions])

  const saveBackfill = useCallback((input: CompletedSlackingInput): string | null => {
    const nowTime = new Date().toISOString()
    const endAt = new Date(input.endTime).getTime()
    if (!Number.isFinite(endAt)) return '请选择有效的结束时间。'
    if (endAt > new Date(nowTime).getTime()) return '补记的结束时间不能晚于现在。'
    const storedSessions = loadSlackingSessions()
    const storedActive = loadActiveSlacking()
    const otherSessions = storedSessions.filter(session => session.id !== input.id)
    const occupied = storedActive
      ? [...otherSessions, { startTime: storedActive.startTime, endTime: nowTime }]
      : otherSessions
    if (hasOverlappingSlacking(occupied, input.startTime, input.endTime)) return '这段时间与已有或正在进行的摸鱼记录重叠，请调整后再保存。'
    const session = createCompletedSlackingSession(input, rate)
    if (!session) return '摸鱼时间无效，请检查后重试。'
    const next = [session, ...otherSessions]
    const storedAchievementState = loadAchievementState('slacking')
    const nextAchievementState = reconcileAchievementSessions(
      'slacking',
      storedAchievementState,
      next.map(item => item.id === session.id ? { ...item, endTime: nowTime } : item),
      nowTime,
    )
    const transaction = runReversibleStorageTransaction([
      {
        write: () => saveJSON(keys.sessions, next),
        rollback: () => { saveJSON(keys.sessions, storedSessions) },
      },
      {
        write: () => saveAchievementState('slacking', nextAchievementState),
        rollback: () => { saveAchievementState('slacking', storedAchievementState) },
      },
    ])
    if (!transaction.success) {
      if (transaction.failedStep === 1) setAchievementSaveFailed(true)
      return transaction.failedStep === 0
        ? '摸鱼记录保存失败，本次补记尚未完成，请重试。'
        : '成就进度保存失败，本次补记尚未完成，请重试。'
    }
    setSessions(next)
    setAchievementState(nextAchievementState)
    setAchievementSaveFailed(false)
    setPage(1)
    setTimeDialogPurpose(null)
    setFinishNotice({ id: session.id, message: `补记成功：摸鱼 ${formatDuration(session.durationSeconds)}，赚了 ¥${session.earnedAmount.toFixed(2)}` })
    return null
  }, [rate, sessions])

  const persistCompletedStop = useCallback((expectedStartTime: string): boolean => {
    const latest = prepareSlackingWebStop(expectedStartTime)
    const session = latest.completedSession
    if (!session) {
      setActive(latest.active)
      setSessions(latest.sessions)
      setPendingRepairStart(null)
      setStopError('未找到可恢复的摸鱼记录，请刷新后再试。')
      return false
    }

    const nextSessions = upsertTimerSession(latest.sessions, session)
    const storedAchievementState = loadAchievementState('slacking')
    const nextAchievementState = reconcileAchievementSessions(
      'slacking',
      storedAchievementState,
      nextSessions,
      new Date().toISOString(),
    )
    const matchingActive = sameTimerStart(latest.active?.startTime, session.startTime)
      ? latest.active
      : null
    const steps = [
      {
        write: () => saveJSON(keys.sessions, nextSessions),
        rollback: () => { saveJSON(keys.sessions, latest.sessions) },
      },
      {
        write: () => saveAchievementState('slacking', nextAchievementState),
        rollback: () => { saveAchievementState('slacking', storedAchievementState) },
      },
      ...(matchingActive ? [{
        write: () => removeJSON(keys.activeSlacking),
        rollback: () => { saveJSON(keys.activeSlacking, matchingActive) },
      }] : []),
    ]
    const transaction = runReversibleStorageTransaction(steps)
    if (!transaction.success) {
      const refreshed = prepareSlackingWebStop(expectedStartTime)
      setActive(refreshed.active)
      setSessions(refreshed.sessions)
      if (transaction.failedStep === 1) setAchievementSaveFailed(true)
      if (!matchingActive) setPendingRepairStart(expectedStartTime)
      setStopError(matchingActive
        ? '结束摸鱼时保存失败，计时状态没有丢失，请重试。'
        : '摸鱼记录已结束，但成就进度同步失败，请重试保存。')
      return false
    }

    setPendingRepairStart(null)
    setStopError('')
    setActive(matchingActive ? null : latest.active)
    setSessions(nextSessions)
    setAchievementState(nextAchievementState)
    setAchievementSaveFailed(false)
    setPage(1)
    if (matchingActive) {
      setFinishNotice({ id: session.id, message: `才赚了¥${session.earnedAmount.toFixed(2)}，这就不摸了？` })
    }
    return true
  }, [])

  const retryPendingRepair = useCallback(() => {
    if (!pendingRepairStart || stoppingRef.current) return
    stoppingRef.current = true
    setStopError('')
    try {
      persistCompletedStop(pendingRepairStart)
    } finally {
      stoppingRef.current = false
    }
  }, [pendingRepairStart, persistCompletedStop])

  const stop = useCallback(() => {
    if (!active || stoppingRef.current) return
    stoppingRef.current = true
    setStopError('')
    try {
      // The native widget journal can finish this timer before React receives
      // the resulting reload. Re-read localStorage at the write boundary so a
      // stale page click cannot overwrite or duplicate the native session.
      const latest = prepareSlackingWebStop(active.startTime)
      if (!latest.shouldStop) {
        if (!latest.completedSession) {
          setActive(latest.active)
          setSessions(latest.sessions)
          setPage(1)
          return
        }
        persistCompletedStop(active.startTime)
        return
      }
      const endTime = new Date().toISOString()
      const stopActive = latest.active ?? active
      const startTime = stopActive.startTime
      const durationSeconds = elapsedSecondsSince(startTime, new Date(endTime))
      const sessionId = createWebTimerSessionId('slacking', startTime)
      if (!sessionId) {
        setStopError('开始时间无效，无法结束这次摸鱼。')
        return
      }
      const businessDate = resolveSessionStartBusinessDate(
        startTime,
        stopActive.startLocalDate,
        stopActive.startTimezoneOffsetMinutes,
      )
      if (!businessDate) {
        setStopError('开始时间无效，无法结束这次摸鱼。')
        return
      }
      const session: SlackingSession = {
        id: sessionId,
        startTime,
        ...businessDate,
        endTime,
        durationSeconds,
        earnedAmount: slackingEarned(startTime, endTime, rate),
      }
      const next = upsertTimerSession(latest.sessions, session)
      const storedAchievementState = loadAchievementState('slacking')
      const nextAchievementState = reconcileAchievementSessions(
        'slacking',
        storedAchievementState,
        next,
        endTime,
      )
      const transaction = runReversibleStorageTransaction([
        {
          write: () => saveJSON(keys.sessions, next),
          rollback: () => { saveJSON(keys.sessions, latest.sessions) },
        },
        {
          write: () => saveAchievementState('slacking', nextAchievementState),
          rollback: () => { saveAchievementState('slacking', storedAchievementState) },
        },
        {
          write: () => removeJSON(keys.activeSlacking),
          rollback: () => { saveJSON(keys.activeSlacking, stopActive) },
        },
      ])
      if (!transaction.success) {
        setActive(stopActive)
        setSessions(latest.sessions)
        if (transaction.failedStep === 1) setAchievementSaveFailed(true)
        setStopError('结束摸鱼时保存失败，计时仍在继续，请重试。')
        return
      }
      setActive(null)
      setSessions(next)
      setAchievementState(nextAchievementState)
      setPage(1)
      setAchievementSaveFailed(false)
      setFinishNotice({ id: session.id, message: `才赚了¥${session.earnedAmount.toFixed(2)}，这就不摸了？` })
    } finally {
      stoppingRef.current = false
    }
  }, [active, persistCompletedStop, rate])

  const closeFinishNotice = useCallback(() => setFinishNotice(null), [])
  const closeTimeDialog = useCallback(() => setTimeDialogPurpose(null), [])
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
      <div className="fish-orbit slacking-visual" role="img" aria-label={`摸鱼状态：${timerVisual.label}`} title={`摸鱼状态：${timerVisual.label}`}>{timerVisual.emoji}</div>
      <p>{active ? '正在摸鱼……' : '今天准备摸一会儿？'}</p>
      <div className="timer-number">{active ? formatTimerDuration(liveSeconds) : '00:00:00'}</div>
      <small>老板已为这段时间支付</small>
      <div className="timer-money">¥{liveMoney.toFixed(2)}</div>
      {active ? <button type="button" className="stop-button" onClick={stop}><Square size={18}/>结束摸鱼</button> : <button type="button" className="primary-button big" onClick={() => setTimeDialogPurpose('start')}><Play size={18}/>开始摸鱼</button>}
      {stopError && <div className="timer-stop-error" role="alert"><span>{stopError}</span>{pendingRepairStart ? <button type="button" onClick={retryPendingRepair}>重试保存</button> : null}</div>}
      <button type="button" className="timer-backfill-button" onClick={() => setTimeDialogPurpose('backfill')}><History size={15}/>补记已结束摸鱼</button>
      <span className="timer-rate">+ ¥{rate.toFixed(5)} / 秒</span>
    </div>
    <div className="summary-strip slacking-summary"><div><small>历史摸鱼收益</small><strong>¥{totalMoney.toFixed(2)}</strong></div><div><small>当前保留的摸鱼时间</small><strong>{formatDuration(totalSeconds)}</strong></div><button type="button" className="text-button clear-slacking-button" disabled={sessions.length === 0} onClick={() => setPendingDelete({ type: 'all' })}><Trash2 size={15}/>清空历史</button></div>
    <AchievementPanel kind="slacking" state={achievementState} activeSeconds={liveSeconds} saveFailed={achievementSaveFailed}/>
    <div className="list-section"><div className="section-title"><h2>摸鱼记录</h2><span>{sessions.length} 次</span></div>{sessions.length === 0 ? <div className="empty">还没有摸鱼记录。</div> : <><div className="item-list">{visibleSessions.map(session => { const visual = slackingSessionVisual(session.durationSeconds); return <article className="list-card slacking-record" key={session.id}><div className="item-avatar fish slacking-record-visual" role="img" aria-label={visual.label} title={visual.label}>{visual.emoji}</div><div className="item-main"><b>{formatSessionTime(session.startTime)}</b><span>至 {formatSessionTime(session.endTime)} · {formatDuration(session.durationSeconds)}</span></div><div className="item-result"><small>本次摸鱼</small><strong>¥{session.earnedAmount.toFixed(2)}</strong></div><button className="icon-button slacking-delete-button" type="button" onClick={() => setPendingDelete({ type: 'session', session })} aria-label="删除这次摸鱼记录" title="删除"><Trash2 size={16}/></button></article> })}</div><Pagination total={sessions.length} page={currentPage} onPageChange={setPage}/></>}</div>
    <SlackingTimeDialog open={timeDialogPurpose !== null} purpose={timeDialogPurpose ?? 'start'} onStart={start} onBackfill={saveBackfill} onCancel={closeTimeDialog}/>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.type === 'all' ? '你要悄悄地删掉全部摸鱼记录吗？' : '你要悄悄地删掉这次摸鱼记录吗？'} message={pendingDelete ? `${pendingDelete.type === 'session' ? `${new Date(pendingDelete.session.startTime).toLocaleString('zh-CN')} · ¥${pendingDelete.session.earnedAmount.toFixed(2)}。` : ''}计时记录会被删除，但已点亮勋章和成就累计时长会永久保留。` : undefined} confirmLabel="对，打枪的不要" cancelLabel="不，我光明正大" onConfirm={confirmDelete} onCancel={cancelDelete}/>
    {finishNotice ? <FinishToast key={finishNotice.id} message={finishNotice.message} onClose={closeFinishNotice}/> : null}
  </section>
}
