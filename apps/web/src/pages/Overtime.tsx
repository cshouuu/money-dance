import { calculateRates, formatDuration } from '@salary-flow/core'
import { BriefcaseBusiness, Coffee, Crown, Flame, History, MoonStar, Play, Square, Trash2, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AchievementPanel } from '../components/AchievementPanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FinishToast } from '../components/FinishToast'
import { OvertimeBackfillDialog } from '../components/OvertimeBackfillDialog'
import { OvertimeStartDialog } from '../components/OvertimeStartDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { loadAttendanceRecords, loadChinaHolidaySettings } from '../lib/attendance'
import {
  elapsedSecondsSince,
  formatTimerDuration,
  getAchievementSnapshot,
  loadAchievementState,
  reconcileAchievementSessions,
  saveAchievementState,
} from '../lib/achievements'
import { loadLedger, saveLedger } from '../lib/ledger'
import {
  calculateOvertimeEarnings,
  createCompletedOvertimeSession,
  createOvertimeLedgerEntries,
  hasOverlappingOvertime,
  loadOvertimeSessions,
  overtimeIntervalsOverlap,
  overtimePayLabel,
  type CompletedOvertimeInput,
} from '../lib/overtime'
import { toLocalDateValue } from '../lib/form'
import { loadProfile, salaryProfileForBusinessDate } from '../lib/profile'
import { resolveSessionStartBusinessDate } from '../lib/sessionBusinessDate'
import { keys, loadJSON, removeJSON, saveJSON } from '../lib/storage'
import { runReversibleStorageTransaction } from '../lib/storageTransaction'
import { createWebTimerSessionId, sameTimerStart, upsertTimerSession } from '../lib/timerStop'
import { useNow } from '../lib/useNow'
import { prepareOvertimeWebStop } from '../lib/widgetActions'
import type { ActiveOvertime, OvertimeSession } from '../types'
import './Overtime.css'

type PendingDelete = { type: 'all' } | { type: 'session'; session: OvertimeSession } | null

function formatStart(value: string): string {
  const date = new Date(value)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

const OVERTIME_VISUALS = [
  { Icon: BriefcaseBusiness, label: '准备开工' },
  { Icon: Coffee, label: '咖啡续命' },
  { Icon: MoonStar, label: '月色常客' },
  { Icon: Zap, label: '工位守夜' },
  { Icon: Flame, label: '燃烧工时' },
  { Icon: Crown, label: '加班传说' },
] as const

function overtimeVisual(level: number) {
  return OVERTIME_VISUALS[Math.min(OVERTIME_VISUALS.length - 1, Math.max(0, Math.floor(level)))]!
}

function overtimeSessionVisualLevel(durationSeconds: number): number {
  if (durationSeconds >= 8 * 3600) return 5
  if (durationSeconds >= 4 * 3600) return 4
  if (durationSeconds >= 2 * 3600) return 3
  if (durationSeconds >= 3600) return 2
  if (durationSeconds >= 30 * 60) return 1
  return 0
}

export function Overtime() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [profile] = useState(() => loadProfile())
  const now = useNow(1000)
  const currentDate = toLocalDateValue(now)
  const [attendanceRecords] = useState(() => loadAttendanceRecords())
  const [holidaySettings] = useState(() => loadChinaHolidaySettings())
  const rates = useMemo(() => calculateRates(salaryProfileForBusinessDate(
    profile,
    currentDate,
    attendanceRecords,
    holidaySettings,
  )), [attendanceRecords, currentDate, holidaySettings, profile])
  const [active, setActive] = useState<ActiveOvertime | null>(() => loadJSON<ActiveOvertime | null>(keys.activeOvertime, null))
  const [sessions, setSessions] = useState<OvertimeSession[]>(loadOvertimeSessions)
  const [achievementState, setAchievementState] = useState(() => reconcileAchievementSessions(
    'overtime',
    loadAchievementState('overtime'),
    sessions,
    new Date().toISOString(),
  ))
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [finishNotice, setFinishNotice] = useState<{ id: string; message: string } | null>(null)
  const [achievementSaveFailed, setAchievementSaveFailed] = useState(false)
  const [stopError, setStopError] = useState('')
  const [pendingRepairStart, setPendingRepairStart] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const stoppingRef = useRef(false)

  const liveSeconds = active ? elapsedSecondsSince(active.startTime, now) : 0
  const liveMoney = active ? calculateOvertimeEarnings(active, liveSeconds, rates.second) : 0
  const currentPage = Math.min(page, getPageCount(sessions.length))
  const visibleSessions = getPageItems(sessions, currentPage)
  const totalSeconds = useMemo(() => sessions.reduce((total, session) => total + session.durationSeconds, 0), [sessions])
  const totalMoney = useMemo(() => sessions.reduce((total, session) => total + session.earnedAmount, 0), [sessions])
  const achievementSnapshot = getAchievementSnapshot('overtime', achievementState, liveSeconds)
  const timerVisual = overtimeVisual(achievementSnapshot.highestLevel)
  useEffect(() => {
    setAchievementState(current => reconcileAchievementSessions('overtime', current, sessions, new Date().toISOString()))
  }, [sessions])

  useEffect(() => {
    setAchievementSaveFailed(!saveAchievementState('overtime', achievementState))
  }, [achievementState])

  useEffect(() => {
    if (searchParams.get('start') !== '1') return
    if (!active) setStartDialogOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('start')
    setSearchParams(next, { replace: true })
  }, [active, searchParams, setSearchParams])

  const openStartDialog = useCallback(() => setStartDialogOpen(true), [])
  const closeStartDialog = useCallback(() => setStartDialogOpen(false), [])
  const openBackfillDialog = useCallback(() => setBackfillDialogOpen(true), [])
  const closeBackfillDialog = useCallback(() => setBackfillDialogOpen(false), [])
  const cancelDelete = useCallback(() => setPendingDelete(null), [])
  const closeFinishNotice = useCallback(() => setFinishNotice(null), [])
  const start = useCallback((option: ActiveOvertime): string | null => {
    if (pendingRepairStart) return '上一次加班记录尚未完成同步，请先点击“重试保存”。'
    const endTime = new Date().toISOString()
    const startAt = new Date(option.startTime).getTime()
    if (!Number.isFinite(startAt)) return '请选择有效的实际开始时间。'
    if (startAt > new Date(endTime).getTime()) return '实际开始时间不能晚于现在。'
    const storedActive = loadJSON<ActiveOvertime | null>(keys.activeOvertime, null)
    if (storedActive) {
      setActive(storedActive)
      return '已有一段加班正在计时，请先结束后再开始。'
    }
    const storedSessions = loadOvertimeSessions()
    if (hasOverlappingOvertime(storedSessions, option.startTime, endTime)) return '这段时间与已有加班记录重叠，请换一个开始时间。'
    const businessDate = resolveSessionStartBusinessDate(
      option.startTime,
      option.startLocalDate,
      option.startTimezoneOffsetMinutes,
    )
    if (!businessDate) return '请选择有效的实际开始时间。'
    const next: ActiveOvertime = { ...option, ...businessDate }
    if (!saveJSON(keys.activeOvertime, next)) return '保存失败，请检查浏览器存储空间后重试。'
    setActive(next)
    setStartDialogOpen(false)
    return null
  }, [pendingRepairStart, sessions])

  const saveBackfill = useCallback((input: CompletedOvertimeInput): string | null => {
    const nowTime = new Date().toISOString()
    const endAt = new Date(input.endTime).getTime()
    if (!Number.isFinite(endAt)) return '请选择有效的结束时间。'
    if (endAt > new Date(nowTime).getTime()) return '补记的结束时间不能晚于现在。'
    const storedSessions = loadOvertimeSessions()
    const storedActive = loadJSON<ActiveOvertime | null>(keys.activeOvertime, null)
    const otherSessions = storedSessions.filter(session => session.id !== input.id)
    if (hasOverlappingOvertime(otherSessions, input.startTime, input.endTime)) return '这段时间与已有加班记录重叠，请调整后再保存。'
    if (storedActive && overtimeIntervalsOverlap(input.startTime, input.endTime, storedActive.startTime, nowTime)) return '这段时间与正在进行的加班重叠，请调整后再保存。'
    const sessionRate = calculateRates(salaryProfileForBusinessDate(
      profile,
      toLocalDateValue(new Date(input.startTime)),
      attendanceRecords,
      holidaySettings,
    )).second
    const session = createCompletedOvertimeSession(input, sessionRate)
    if (!session) return '加班时间或计薪方式无效，请检查后重试。'

    const next = [session, ...otherSessions]
    const storedLedger = loadLedger()
    const nextLedger = [
      ...createOvertimeLedgerEntries(session, () => `backfill-overtime-ledger-${session.id}`),
      ...storedLedger.filter(entry => entry.kind !== 'overtime' || entry.linkedId !== session.id),
    ]
    const storedAchievementState = loadAchievementState('overtime')
    // A historical backfill is unlocked now, not retroactively at its old end time.
    const nextAchievementState = reconcileAchievementSessions(
      'overtime',
      storedAchievementState,
      next.map(item => item.id === session.id ? { ...item, endTime: nowTime } : item),
      nowTime,
    )

    const transaction = runReversibleStorageTransaction([
      {
        write: () => saveJSON(keys.overtimeSessions, next),
        rollback: () => { saveJSON(keys.overtimeSessions, storedSessions) },
      },
      {
        write: () => saveJSON(keys.ledger, nextLedger),
        rollback: () => { saveJSON(keys.ledger, storedLedger) },
      },
      {
        write: () => saveAchievementState('overtime', nextAchievementState),
        rollback: () => { saveAchievementState('overtime', storedAchievementState) },
      },
    ])
    if (!transaction.success) {
      if (transaction.failedStep === 0) return '加班记录保存失败，本次补记尚未完成，请重试。'
      if (transaction.failedStep === 1) return '账本保存失败，本次补记尚未完成，请重试。'
      setAchievementSaveFailed(true)
      return '成就进度保存失败，本次补记尚未完成，请重试。'
    }
    setSessions(next)
    setAchievementState(nextAchievementState)
    setAchievementSaveFailed(false)
    setPage(1)
    setBackfillDialogOpen(false)
    setFinishNotice({ id: session.id, message: `补记成功：${formatDuration(session.durationSeconds)} · ¥${session.earnedAmount.toFixed(2)}` })
    return null
  }, [attendanceRecords, holidaySettings, profile, sessions])

  const persistCompletedStop = useCallback((expectedStartTime: string): boolean => {
    const latest = prepareOvertimeWebStop(expectedStartTime)
    const session = latest.completedSession
    if (!session) {
      setActive(latest.active)
      setSessions(latest.sessions)
      setPendingRepairStart(null)
      setStopError('未找到可恢复的加班记录，请刷新后再试。')
      return false
    }

    // The native widget or an earlier partial Web write may have saved only
    // part of a stop. Re-save every derived store with stable IDs before
    // clearing a still-matching timer. If another timer is already active it
    // must remain untouched while this older session is repaired.
    const nextSessions = upsertTimerSession(latest.sessions, session)
    const nextLedger = [
      ...createOvertimeLedgerEntries(session, () => `web-overtime-ledger-${session.id}`),
      ...latest.ledger.filter(entry => entry.kind !== 'overtime' || entry.linkedId !== session.id),
    ]
    const storedAchievementState = loadAchievementState('overtime')
    const nextAchievementState = reconcileAchievementSessions(
      'overtime',
      storedAchievementState,
      nextSessions,
      new Date().toISOString(),
    )
    const matchingActive = sameTimerStart(latest.active?.startTime, session.startTime)
      ? latest.active
      : null
    const steps = [
      {
        write: () => saveJSON(keys.overtimeSessions, nextSessions),
        rollback: () => { saveJSON(keys.overtimeSessions, latest.sessions) },
      },
      {
        write: () => saveJSON(keys.ledger, nextLedger),
        rollback: () => { saveJSON(keys.ledger, latest.ledger) },
      },
      {
        write: () => saveAchievementState('overtime', nextAchievementState),
        rollback: () => { saveAchievementState('overtime', storedAchievementState) },
      },
      ...(matchingActive ? [{
        write: () => removeJSON(keys.activeOvertime),
        rollback: () => { saveJSON(keys.activeOvertime, matchingActive) },
      }] : []),
    ]
    const transaction = runReversibleStorageTransaction(steps)
    if (!transaction.success) {
      const refreshed = prepareOvertimeWebStop(expectedStartTime)
      setActive(refreshed.active)
      setSessions(refreshed.sessions)
      if (transaction.failedStep === 2) setAchievementSaveFailed(true)
      if (!matchingActive) setPendingRepairStart(expectedStartTime)
      setStopError(matchingActive
        ? '结束加班时保存失败，计时状态没有丢失，请重试。'
        : '加班记录已结束，但账本或成就同步失败，请重试保存。')
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
      setFinishNotice({ id: session.id, message: `终于结束了，这次加班赚了¥${session.earnedAmount.toFixed(2)}，赶紧去犒劳一下自己吧` })
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
      // Native widget actions are applied outside React's render cycle. Treat
      // persisted state as authoritative immediately before creating a session
      // or ledger entry so a stale page cannot record the same stop twice.
      const latest = prepareOvertimeWebStop(active.startTime)
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
      const durationSeconds = elapsedSecondsSince(stopActive.startTime, new Date(endTime))
      const sessionId = createWebTimerSessionId('overtime', stopActive.startTime)
      if (!sessionId) {
        setStopError('开始时间无效，无法结束这次加班。')
        return
      }
      const businessDate = resolveSessionStartBusinessDate(
        stopActive.startTime,
        stopActive.startLocalDate,
        stopActive.startTimezoneOffsetMinutes,
      )
      if (!businessDate) {
        setStopError('开始时间无效，无法结束这次加班。')
        return
      }
      const session: OvertimeSession = {
        ...stopActive,
        ...businessDate,
        id: sessionId,
        endTime,
        durationSeconds,
        earnedAmount: calculateOvertimeEarnings(stopActive, durationSeconds, rates.second),
      }
      const next = upsertTimerSession(latest.sessions, session)
      const nextLedger = [
        ...createOvertimeLedgerEntries(session, () => `web-overtime-ledger-${session.id}`),
        ...latest.ledger.filter(entry => entry.kind !== 'overtime' || entry.linkedId !== session.id),
      ]
      const storedAchievementState = loadAchievementState('overtime')
      const nextAchievementState = reconcileAchievementSessions(
        'overtime',
        storedAchievementState,
        next,
        endTime,
      )
      const transaction = runReversibleStorageTransaction([
        {
          write: () => saveJSON(keys.overtimeSessions, next),
          rollback: () => { saveJSON(keys.overtimeSessions, latest.sessions) },
        },
        {
          write: () => saveJSON(keys.ledger, nextLedger),
          rollback: () => { saveJSON(keys.ledger, latest.ledger) },
        },
        {
          write: () => saveAchievementState('overtime', nextAchievementState),
          rollback: () => { saveAchievementState('overtime', storedAchievementState) },
        },
        {
          write: () => removeJSON(keys.activeOvertime),
          rollback: () => { saveJSON(keys.activeOvertime, stopActive) },
        },
      ])
      if (!transaction.success) {
        setActive(stopActive)
        setSessions(latest.sessions)
        if (transaction.failedStep === 2) setAchievementSaveFailed(true)
        setStopError('结束加班时保存失败，计时仍在继续，请重试。')
        return
      }
      setActive(null)
      setSessions(next)
      setAchievementState(nextAchievementState)
      setPage(1)
      setAchievementSaveFailed(false)
      setFinishNotice({ id: session.id, message: `终于结束了，这次加班赚了¥${session.earnedAmount.toFixed(2)}，赶紧去犒劳一下自己吧` })
    } finally {
      stoppingRef.current = false
    }
  }, [active, persistCompletedStop, rates.second])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const reconciled = reconcileAchievementSessions(
      'overtime',
      achievementState,
      sessions,
      new Date().toISOString(),
    )
    if (!saveAchievementState('overtime', reconciled)) {
      setAchievementSaveFailed(true)
      setPendingDelete(null)
      return
    }
    setAchievementState(reconciled)
    setAchievementSaveFailed(false)
    const removed = pendingDelete.type === 'all' ? sessions : [pendingDelete.session]
    const removedIds = new Set(removed.map(session => session.id))
    const next = pendingDelete.type === 'all' ? [] : sessions.filter(session => !removedIds.has(session.id))
    setSessions(next)
    saveJSON(keys.overtimeSessions, next)
    saveLedger(loadLedger().filter(entry => entry.kind !== 'overtime' || !entry.linkedId || !removedIds.has(entry.linkedId)))
    setPage(1)
    setPendingDelete(null)
  }, [achievementState, pendingDelete, sessions])

  return <section className="page overtime-page">
    <header className="page-header"><div><p className="eyebrow">OVERTIME TIMER</p><h1>加班，也得算得明白。</h1><p>有钱就算钱，没钱也把时间记下来。刷新、锁屏或切换页面都不会丢失计时。</p></div></header>

    <div className="timer-workspace">
    <div className={`timer-card overtime-timer${active ? ' running' : ''}`}>
      <div className={`overtime-orbit level-${achievementSnapshot.highestLevel}`} role="img" aria-label={`加班状态：${timerVisual.label}`} title={`加班状态：${timerVisual.label}`}><timerVisual.Icon size={32}/></div>
      <p>{active ? '正在加班……' : '今天又要加班吗？'}</p>
      <div className="timer-number">{active ? formatTimerDuration(liveSeconds) : '00:00:00'}</div>
      <small>{active?.payMode === 'unpaid' ? '这段时间没有加班费' : '本次预计加班收入'}</small>
      <div className="timer-money">¥{liveMoney.toFixed(2)}</div>
      {active ? <button type="button" className="stop-button" onClick={stop}><Square size={18}/>结束加班</button> : <button type="button" className="primary-button big" onClick={openStartDialog}><Play size={18}/>开始加班</button>}
      {stopError && <div className="timer-stop-error" role="alert"><span>{stopError}</span>{pendingRepairStart ? <button type="button" onClick={retryPendingRepair}>重试保存</button> : null}</div>}
      <button type="button" className="timer-backfill-button" onClick={openBackfillDialog}><History size={15}/>补记已结束加班</button>
      <span className="timer-rate">{active ? active.payMode === 'unpaid' ? '只计时间 · 不计收入' : active.payMode === 'fixed' ? `本次固定加班费 ¥${(active.fixedAmount ?? 0).toFixed(2)}` : `+ ¥${(rates.second * (active.multiplier ?? 1)).toFixed(5)} / 秒 · ${active.multiplier ?? 1} 倍工资` : '开始时再选择有没有加班费'}</span>
    </div>

    <div className="timer-side-panel">
      <div className="summary-strip overtime-summary"><div><small>历史加班收入</small><strong>¥{totalMoney.toFixed(2)}</strong></div><div><small>当前保留的加班时间</small><strong>{formatDuration(totalSeconds)}</strong></div><button type="button" className="text-button clear-overtime-button" disabled={sessions.length === 0} onClick={() => setPendingDelete({ type: 'all' })}><Trash2 size={15}/>清空历史</button></div>
      <section className="timer-guide"><p className="eyebrow">HOW IT WORKS</p><h2>每次开始前，再决定怎么算。</h2><div><span><b>01</b><small>确认实际开始时间</small></span><span><b>02</b><small>选择无加班费、倍率或固定金额</small></span><span><b>03</b><small>结束后自动写入账本</small></span></div></section>
    </div>
    </div>

    <AchievementPanel kind="overtime" state={achievementState} activeSeconds={liveSeconds} saveFailed={achievementSaveFailed}/>

    <div className="list-section"><div className="section-title"><h2>加班记录</h2><span>{sessions.length} 次</span></div>{sessions.length === 0 ? <div className="empty">还没有加班记录。</div> : <><div className="item-list">{visibleSessions.map(session => { const visual = overtimeVisual(overtimeSessionVisualLevel(session.durationSeconds)); return <article className="list-card overtime-record" key={session.id}><div className={`item-avatar overtime-avatar level-${overtimeSessionVisualLevel(session.durationSeconds)}`} role="img" aria-label={`本次状态：${visual.label}`} title={`本次状态：${visual.label}`}><visual.Icon size={19}/></div><div className="item-main"><b>{formatStart(session.startTime)}</b><span>至 {formatStart(session.endTime)} · {formatDuration(session.durationSeconds)} · {overtimePayLabel(session)}</span></div><div className="item-result"><small>本次加班</small><strong>¥{session.earnedAmount.toFixed(2)}</strong></div><button className="icon-button overtime-delete-button" type="button" onClick={() => setPendingDelete({ type: 'session', session })} aria-label="删除这次加班记录" title="删除"><Trash2 size={16}/></button></article> })}</div><Pagination total={sessions.length} page={currentPage} onPageChange={setPage}/></>}</div>

    <OvertimeStartDialog open={startDialogOpen} onStart={start} onCancel={closeStartDialog}/>
    <OvertimeBackfillDialog open={backfillDialogOpen} onSave={saveBackfill} onCancel={closeBackfillDialog}/>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.type === 'all' ? '这些加班证据也要全部删掉吗？' : '真的要删掉这次加班记录吗？'} message={pendingDelete ? `${pendingDelete.type === 'session' ? `${formatStart(pendingDelete.session.startTime)} · ${overtimePayLabel(pendingDelete.session)} · ¥${pendingDelete.session.earnedAmount.toFixed(2)}。` : ''}计时记录会被删除，但已点亮勋章和成就累计时长会永久保留。` : undefined} confirmLabel="删掉，当没加过" cancelLabel="留着，都是证据" onConfirm={confirmDelete} onCancel={cancelDelete}/>
    {finishNotice && <FinishToast key={finishNotice.id} message={finishNotice.message} onClose={closeFinishNotice}/>}
  </section>
}
