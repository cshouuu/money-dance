import { calculateRates, formatDuration } from '@salary-flow/core'
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Clock3, Fish, Pause, Play, RotateCcw, Sparkles, Square, Target, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EarlyFinishDialog } from '../components/EarlyFinishDialog'
import { WorkTimeDialog } from '../components/WorkTimeDialog'
import { NumberTicker } from '../ui/NumberTicker'
import { loadAchievementState, reconcileAchievementSessions, saveAchievementState } from '../lib/achievements'
import { alternatingWeekTypeForDate, attendancePayModeLabel, attendanceStatusLabel, attendanceWorkedFraction, isConfiguredWorkday, isHalfDayLeave, loadAttendanceRecords, loadChinaHolidaySettings } from '../lib/attendance'
import { toLocalDateValue, toLocalTimeValue } from '../lib/form'
import { createId } from '../lib/id'
import { loadLedger, saveLedger } from '../lib/ledger'
import { getMonthlyWorkStats } from '../lib/monthlyStats'
import { getPaydayCountdown } from '../lib/payday'
import { loadProfile, salaryProfileForBusinessDate } from '../lib/profile'
import { calculateOvertimeEarnings, createCompletedOvertimeSession, createOvertimeLedgerEntries, loadOvertimeSessions, overtimeIntervalsOverlap, splitOvertimeSessionByLocalDay } from '../lib/overtime'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { sessionStartLocalDate } from '../lib/sessionBusinessDate'
import { loadSlackingSessions, slackingPaidDurationSeconds } from '../lib/slacking'
import { useNow } from '../lib/useNow'
import { getWishProgress } from '../lib/wishProgress'
import { closeActiveWorkSession, commitFlexibleOvertimeSettlement, commitFlexibleWorkCorrection, commitFlexibleWorkStart, freezeFlexibleWorkForSettlement, getAutomaticFlexibleSettlementMode, getCurrentWorkRecord, getFlexibleBaseSettlementAmount, getFlexibleEarnedAmount, getFlexibleOvertimeWindow, getFlexibleSettlementRequirement, getFlexibleWorkedSeconds, hasFlexiblePlannedEndReached, isFlexibleFullDaySettlement, loadWorkRecords, replaceFlexibleWorkTime, resumeFlexibleWork, saveWorkRecords, scheduledOverride, settleFlexibleWorkRecord, startFlexibleWork, summarizeTodayWork, upsertWorkRecord } from '../lib/work'
import type { ActiveOvertime, AttendanceRecord, DailyWorkRecord, FlexibleWorkSettlementMode, OvertimeSession, OvertimeStartOption, SlackingSession, WishItem } from '../types'
import './Dashboard.css'

const money = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const moneyFromCents = (cents: number) => money(cents / 100)

function overtimeOverlapsSegments(session: OvertimeSession, segments: readonly { startTime: string; endTime: string }[]): boolean {
  const sessionSegments = session.segments?.length ? session.segments : [{ startTime: session.startTime, endTime: session.endTime }]
  return segments.some(segment => sessionSegments.some(existing => overtimeIntervalsOverlap(
    segment.startTime,
    segment.endTime,
    existing.startTime,
    existing.endTime,
  )))
}

const statusLabels = {
  ready: '等待开始',
  working: '正在计薪',
  paused: '已暂停',
  ended: '今日已结束',
} as const

export function Dashboard() {
  const navigate = useNavigate()
  const now = useNow(1000)
  const [profile] = useState(() => loadProfile())
  const [workRecords, setWorkRecords] = useState<DailyWorkRecord[]>(() => loadWorkRecords())
  const workRecordsRef = useRef(workRecords)
  const settledActionRef = useRef<HTMLButtonElement>(null)
  const [attendanceRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [holidaySettings] = useState(() => loadChinaHolidaySettings())
  const [ledger, setLedger] = useState(() => loadLedger())
  const [slackingSessions] = useState<SlackingSession[]>(loadSlackingSessions)
  const [overtimeSessions, setOvertimeSessions] = useState<OvertimeSession[]>(loadOvertimeSessions)
  const [activeOvertime] = useState<ActiveOvertime | null>(() => loadJSON<ActiveOvertime | null>(keys.activeOvertime, null))
  const [wishes] = useState<WishItem[]>(() => loadJSON<WishItem[]>(keys.wishes, []))
  const [dialogPurpose, setDialogPurpose] = useState<'start' | 'adjust' | null>(null)
  const [pendingEndRecord, setPendingEndRecord] = useState<DailyWorkRecord | null>(() => {
    const currentRecord = getCurrentWorkRecord(workRecords, new Date())
    return currentRecord?.settlementPending ? currentRecord : null
  })
  const [settlementError, setSettlementError] = useState('')
  const settlingRef = useRef(false)
  const today = toLocalDateValue(now)
  const currentMinute = Math.floor(now.getTime() / 60_000)
  const currentRates = useMemo(() => calculateRates(
    salaryProfileForBusinessDate(profile, today, attendanceRecords, holidaySettings),
  ), [attendanceRecords, holidaySettings, profile, today])
  const paydayCountdown = getPaydayCountdown(profile.payday, now, {
    adjustment: profile.paydayAdjustment,
    isWorkday: date => isConfiguredWorkday(date, profile, holidaySettings),
  })
  const work = summarizeTodayWork(profile, workRecords, now, undefined, attendanceRecords)
  const workRates = useMemo(() => calculateRates(
    salaryProfileForBusinessDate(profile, work.businessDate, attendanceRecords, holidaySettings),
  ), [attendanceRecords, holidaySettings, profile, work.businessDate])
  const targetSeconds = workRates.paidSecondsPerDay * attendanceWorkedFraction(work.attendance)
  const earned = work.earnedAmount
  const worked = work.workedSeconds
  const progress = targetSeconds > 0 ? Math.max(0, Math.min(100, (worked / targetSeconds) * 100)) : 0
  const hasReachedFlexibleTarget = work.mode === 'flexible' && worked >= targetSeconds
  const workDate = work.record?.date ?? today
  const todaySlacking = useMemo(() => slackingSessions.filter(session => sessionStartLocalDate(session) === today), [slackingSessions, today])
  const slackingSeconds = useMemo(() => todaySlacking.reduce((total, session) => total + slackingPaidDurationSeconds(session), 0), [todaySlacking])
  const slackingMoney = useMemo(() => todaySlacking.reduce((total, session) => total + session.earnedAmount, 0), [todaySlacking])
  const completedOvertimeToday = useMemo(() => overtimeSessions.flatMap(splitOvertimeSessionByLocalDay).filter(slice => slice.date === today), [overtimeSessions, today])
  const completedOvertimeMoney = useMemo(() => overtimeSessions.filter(session => sessionStartLocalDate(session) === today).reduce((total, session) => total + session.earnedAmount, 0), [overtimeSessions, today])
  const activeOvertimeSlice = useMemo(() => {
    if (!activeOvertime) return null
    const endTime = now.toISOString()
    return splitOvertimeSessionByLocalDay({ ...activeOvertime, endTime }).find(slice => slice.date === today) ?? null
  }, [activeOvertime, now, today])
  const activeOvertimeMoney = activeOvertime && sessionStartLocalDate(activeOvertime) === today
    ? calculateOvertimeEarnings(activeOvertime, Math.max(0, (now.getTime() - new Date(activeOvertime.startTime).getTime()) / 1000), currentRates.second)
    : 0
  const overtimeSeconds = completedOvertimeToday.reduce((total, slice) => total + slice.durationSeconds, 0) + (activeOvertimeSlice?.durationSeconds ?? 0)
  const overtimeMoney = completedOvertimeMoney + activeOvertimeMoney
  const wishlistItems = useMemo(() => wishes.filter(item => !item.purchasedAt), [wishes])
  const featuredWishes = useMemo(() => wishlistItems.slice(0, 3), [wishlistItems])
  const featuredWishProgress = useMemo(() => new Map(featuredWishes.map(item => [
    item.id,
    getWishProgress(item, profile, new Date(currentMinute * 60_000), workRecords, attendanceRecords),
  ])), [attendanceRecords, currentMinute, featuredWishes, profile, workRecords])
  const monthlyStats = useMemo(() => getMonthlyWorkStats(
    profile,
    ledger,
    workRecords,
    attendanceRecords,
    new Date(currentMinute * 60_000),
  ), [attendanceRecords, currentMinute, ledger, profile, workRecords])
  const firstStart = work.record?.sessions[0]?.startTime
  const plannedEndLabel = work.record?.plannedEndTime
    ? `${toLocalDateValue(new Date(work.record.plannedEndTime)) === workDate ? '' : '次日 '}${toLocalTimeValue(new Date(work.record.plannedEndTime))}`
    : null
  const attendanceLabel = work.attendance ? attendanceStatusLabel(work.attendance) : work.officialHolidayName ?? ''
  const customAttendancePayLabel = work.attendance ? attendancePayModeLabel(work.attendance) : null
  const attendancePayLabel = customAttendancePayLabel ?? (work.attendance ? '不计薪' : work.dayType === 'holiday' ? earned > 0 ? '正常日薪' : '不计薪' : '')
  const isNormalPayOverride = work.attendance?.status === 'normal' && customAttendancePayLabel !== null
  const isAttendanceOverride = work.dayType === 'leave' || work.dayType === 'holiday' || isNormalPayOverride || isHalfDayLeave(work.attendance)
  const isFullDaySettlement = isFlexibleFullDaySettlement(work.record, profile.salaryType)
  const isSettledDailyAmount = isFullDaySettlement || isNormalPayOverride || isHalfDayLeave(work.attendance)
  const heroLabel = work.dayType === 'rest' ? '今天休息' : work.dayType === 'holiday' ? '今天放假' : work.dayType === 'leave' ? '今日出勤调整' : isSettledDailyAmount ? '今日工作收入' : work.mode === 'flexible' ? '今日实际已赚' : '今日已经赚了'
  const modeStatus = work.dayType === 'rest'
    ? '非工作日 · 不自动计薪'
    : isAttendanceOverride
      ? `${attendanceLabel} · ${attendancePayLabel}`
      : work.mode === 'flexible'
        ? work.record?.settlementPending
          ? '已停止 · 等待结算'
          : isFullDaySettlement ? '正常出勤 · 全天计薪' : statusLabels[work.status]
        : profile.workWeekMode === 'alternating'
          ? `${alternatingWeekTypeForDate(now, profile) === 'big' ? '大周' : '小周'} · 自动计薪`
          : '固定作息 · 自动计薪'

  const persistRecord = useCallback((record: DailyWorkRecord, keepInMemoryOnFailure = false): boolean => {
    const next = upsertWorkRecord(workRecordsRef.current, record)
    const saved = saveWorkRecords(next)
    if (saved || keepInMemoryOnFailure) {
      workRecordsRef.current = next
      setWorkRecords(next)
    }
    return saved
  }, [])
  const focusSettledAction = useCallback(() => window.setTimeout(() => settledActionRef.current?.focus(), 0), [])

  const removeLinkedFlexibleOvertime = useCallback((record: DailyWorkRecord): boolean => {
    if (!record.overtimeSessionId) return true
    const latestSessions = loadOvertimeSessions()
    const nextSessions = latestSessions.filter(session => session.id !== record.overtimeSessionId)
    if (nextSessions.length !== latestSessions.length) {
      if (!saveJSON(keys.overtimeSessions, nextSessions)) return false
      setOvertimeSessions(nextSessions)
    }
    const latestLedger = loadLedger()
    const nextLedger = latestLedger.filter(entry => entry.kind !== 'overtime' || entry.linkedId !== record.overtimeSessionId)
    if (nextLedger.length !== latestLedger.length) {
      if (!saveLedger(nextLedger)) return false
      setLedger(nextLedger)
    }
    return true
  }, [])

  const closeDialog = useCallback(() => {
    setDialogPurpose(null)
    setSettlementError('')
  }, [])
  const requestSettlement = useCallback((record: DailyWorkRecord) => {
    const frozen = record.settlementPending ? record : freezeFlexibleWorkForSettlement(record)
    const frozenSaved = persistRecord(frozen, true)
    if (!frozenSaved) {
      setPendingEndRecord(frozen)
      setSettlementError('工时已经停止，但暂时无法保存。请释放设备存储空间后重试结算。')
      return
    }
    const workedSeconds = getFlexibleWorkedSeconds(frozen, new Date(frozen.updatedAt))
    const automaticMode = getAutomaticFlexibleSettlementMode(profile.salaryType, workedSeconds, targetSeconds, isAttendanceOverride)
    if (automaticMode) {
      if (!removeLinkedFlexibleOvertime(frozen)) {
        setPendingEndRecord(frozen)
        setSettlementError('旧的加班结算暂时无法更新，请稍后重试。')
        return
      }
      if (!persistRecord(settleFlexibleWorkRecord(frozen, automaticMode))) {
        setPendingEndRecord(frozen)
        setSettlementError('结算暂时无法保存，工时仍保持冻结，请重试。')
        return
      }
      setPendingEndRecord(null)
      setSettlementError('')
      focusSettledAction()
      return
    }
    setSettlementError('')
    setPendingEndRecord(frozen)
  }, [focusSettledAction, isAttendanceOverride, persistRecord, profile.salaryType, removeLinkedFlexibleOvertime, targetSeconds])
  const startAt = useCallback((time: string, plannedEndTime?: string) => {
    const started = startFlexibleWork(today, time, work.record, plannedEndTime)
    if (!commitFlexibleWorkStart(() => persistRecord(started))) {
      setSettlementError('开始工作暂时无法保存，计时尚未启动。请释放设备存储空间后重试。')
      return
    }
    setSettlementError('')
    setDialogPurpose(null)
  }, [persistRecord, today, work.record])
  const adjustTime = useCallback((startTime: string, endTime?: string, endDate?: string) => {
    const record = replaceFlexibleWorkTime(workDate, startTime, endTime, endDate ?? workDate, work.record)
    if (record.status === 'ended') {
      setDialogPurpose(null)
      requestSettlement(record)
      return
    }
    const committed = commitFlexibleWorkCorrection({
      removeLinkedOvertime: () => removeLinkedFlexibleOvertime(record),
      saveWorkRecord: () => persistRecord(record),
    })
    if (!committed.success) {
      setSettlementError(committed.stage === 'overtime-cleanup'
        ? '旧的加班结算暂时无法删除，原工作记录仍保持不变。请释放设备存储空间后重试。'
        : '修正后的工作时间暂时无法保存，原工作记录仍保持不变。请释放设备存储空间后重试。')
      return
    }
    setSettlementError('')
    setDialogPurpose(null)
  }, [persistRecord, removeLinkedFlexibleOvertime, requestSettlement, work.record, workDate])
  const pauseWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(closeActiveWorkSession(work.record, 'paused'))
  }, [work.record, persistRecord])
  const endWork = useCallback(() => {
    if (work.record?.mode !== 'flexible') return
    requestSettlement(freezeFlexibleWorkForSettlement(work.record))
  }, [work.record, requestSettlement])
  const resumeWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(resumeFlexibleWork(work.record))
  }, [work.record, persistRecord])
  const useScheduledToday = useCallback(() => persistRecord(scheduledOverride(today)), [persistRecord, today])
  const settlePendingRecord = useCallback((settlementMode: FlexibleWorkSettlementMode) => {
    if (!pendingEndRecord || settlingRef.current) return
    settlingRef.current = true
    try {
      if (!removeLinkedFlexibleOvertime(pendingEndRecord)) {
        setSettlementError('旧的加班结算暂时无法更新，请稍后重试。')
        return
      }
      if (!persistRecord(settleFlexibleWorkRecord(pendingEndRecord, settlementMode))) {
        setSettlementError('结算暂时无法保存，工时仍保持冻结，请重试。')
        return
      }
      setPendingEndRecord(null)
      setSettlementError('')
      focusSettledAction()
    } finally {
      settlingRef.current = false
    }
  }, [focusSettledAction, pendingEndRecord, persistRecord, removeLinkedFlexibleOvertime])
  const settleFlexibleOvertime = useCallback((option: OvertimeStartOption) => {
    if (!pendingEndRecord || settlingRef.current) return
    const window = getFlexibleOvertimeWindow(pendingEndRecord, targetSeconds, new Date(pendingEndRecord.updatedAt))
    if (!window || !pendingEndRecord.overtimeSessionId) {
      setSettlementError('没有找到有效的超出工时，请修正工作时间后重试。')
      return
    }

    const latestSessions = loadOvertimeSessions()
    const otherSessions = latestSessions.filter(session => session.id !== pendingEndRecord.overtimeSessionId)
    const hasCompletedOverlap = otherSessions.some(session => overtimeOverlapsSegments(session, window.segments))
    const latestActiveOvertime = loadJSON<ActiveOvertime | null>(keys.activeOvertime, null)
    const activeStart = latestActiveOvertime ? new Date(latestActiveOvertime.startTime).getTime() : Number.NaN
    const hasActiveOverlap = Number.isFinite(activeStart) && window.segments.some(segment => (
      activeStart < new Date(segment.endTime).getTime()
      && new Date(pendingEndRecord.updatedAt).getTime() > new Date(segment.startTime).getTime()
    ))
    if (hasCompletedOverlap || hasActiveOverlap) {
      setSettlementError('超出时段与已有加班记录重叠。请先到加班页修正或结束现有记录，再回来结算。')
      return
    }

    const session = createCompletedOvertimeSession({
      ...option,
      id: pendingEndRecord.overtimeSessionId,
      startTime: window.startTime,
      endTime: window.endTime,
      segments: window.segments,
    }, workRates.second)
    if (!session) {
      setSettlementError('加班结算数据无效，请修正工作时间后重试。')
      return
    }

    const nextSessions = [session, ...otherSessions]
    const latestLedger = loadLedger().filter(entry => entry.kind !== 'overtime' || entry.linkedId !== session.id)
    const generatedLedger = createOvertimeLedgerEntries(session, () => `flex-overtime-ledger-${session.id}`)
    const settledLedger = [...generatedLedger, ...latestLedger]
    const achievementState = reconcileAchievementSessions(
      'overtime',
      loadAchievementState('overtime'),
      [session],
      new Date().toISOString(),
    )
    const settledRecord = settleFlexibleWorkRecord(pendingEndRecord, 'full-day')

    settlingRef.current = true
    try {
      const committed = commitFlexibleOvertimeSettlement({
        saveOvertimeSession: () => saveJSON(keys.overtimeSessions, nextSessions),
        saveLedger: () => saveLedger(settledLedger),
        saveAchievement: () => saveAchievementState('overtime', achievementState),
        saveWorkRecord: () => persistRecord(settledRecord),
      })
      if (!committed.success) {
        const stageLabel = committed.stage === 'overtime-session'
          ? '加班记录'
          : committed.stage === 'ledger'
            ? '账本'
            : committed.stage === 'achievement'
              ? '成就进度'
              : '工作结算'
        setSettlementError(`${stageLabel}暂时无法保存，工时仍保持冻结。请释放设备存储空间后重试。`)
        return
      }
      setOvertimeSessions(nextSessions)
      setLedger(settledLedger)
      setPendingEndRecord(null)
      setSettlementError('')
      focusSettledAction()
    } finally {
      settlingRef.current = false
    }
  }, [focusSettledAction, pendingEndRecord, persistRecord, targetSeconds, workRates.second])
  const adjustAttendance = useCallback(() => {
    if (!pendingEndRecord) return
    if (!removeLinkedFlexibleOvertime(pendingEndRecord)) {
      setSettlementError('旧的加班结算暂时无法更新，请稍后重试。')
      return
    }
    if (!persistRecord(settleFlexibleWorkRecord(pendingEndRecord, 'actual'))) {
      setSettlementError('结算暂时无法保存，工时仍保持冻结，请重试。')
      return
    }
    setPendingEndRecord(null)
    setSettlementError('')
    navigate(`/attendance?date=${encodeURIComponent(pendingEndRecord.date)}`)
  }, [navigate, pendingEndRecord, persistRecord, removeLinkedFlexibleOvertime])
  const cancelPendingSettlement = useCallback(() => {
    setPendingEndRecord(null)
    setSettlementError('')
  }, [])
  const pendingWorkedSeconds = pendingEndRecord ? getFlexibleWorkedSeconds(pendingEndRecord, new Date(pendingEndRecord.updatedAt)) : 0
  const pendingRequirement = getFlexibleSettlementRequirement(pendingWorkedSeconds, targetSeconds)
  const pendingActualAmount = pendingEndRecord ? getFlexibleEarnedAmount({ ...pendingEndRecord, settlementMode: 'actual' }, workRates, profile.salaryType, new Date(pendingEndRecord.updatedAt)) : 0
  const pendingBaseAmount = getFlexibleBaseSettlementAmount(work.attendance, workRates.daily)

  useEffect(() => {
    if (work.record?.mode !== 'flexible' || !hasFlexiblePlannedEndReached(work.record, now)) return
    requestSettlement(freezeFlexibleWorkForSettlement(work.record, now))
  }, [now, requestSettlement, work.record])

  return <section className="page dashboard-page">
    <header className="page-header">
      <div><p className="eyebrow">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>今天的时间，正在变成钱。</h1></div>
      <div className="dashboard-header-actions">
        <Link className={`payday-countdown${paydayCountdown ? '' : ' unset'}`} to="/settings" aria-label={paydayCountdown ? (paydayCountdown.daysRemaining === 0 ? '今天发工资' : `距离发工资还有 ${paydayCountdown.daysRemaining} 天`) : '发薪日未设置，前往薪资设置'}>
          <CalendarDays size={17} />
          <span><small>{paydayCountdown ? paydayCountdown.adjusted ? `本次调整至 ${paydayCountdown.nextPayday.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}` : `每月 ${profile.payday} 日发薪` : '发薪日未设置'}</small><b>{paydayCountdown ? paydayCountdown.daysRemaining === 0 ? '今天发工资' : `还有 ${paydayCountdown.daysRemaining} 天` : '去设置'}</b></span>
        </Link>
        <Link className="ghost-button" to="/settings">薪资设置 <ArrowUpRight size={16} /></Link>
      </div>
    </header>

    <div className={`hero-card${work.dayType === 'work' && work.mode === 'flexible' ? ' flexible-work' : ''}`}>
      <div className="hero-glow" />
      <div className="hero-heading-row"><p className="hero-label"><Sparkles size={16}/> {heroLabel}</p><span className="hero-mode-status">{modeStatus}</span></div>
      <NumberTicker className="money-ticker" value={earned * 100} format={moneyFromCents} duration={0.38} stagger={0} startOnView={false} />
      <p className="rate-line">{work.dayType === 'rest'
        ? '休息日不自动计薪'
        : work.officialHolidayName
          ? '已按中国大陆节假日日历计算'
          : isAttendanceOverride
            ? '已按照薪苦日历中的出勤设置计算'
          : work.record?.settlementPending
            ? '工作时间已冻结，等待选择结算方式'
            : isFullDaySettlement
              ? '已按正常出勤结算完整日薪'
              : hasReachedFlexibleTarget
                ? '已达到目标工时，超出部分在结束时选择是否按加班结算'
                : `+ ¥${workRates.second.toFixed(5)} / 秒`}</p>

      {work.dayType === 'work' && work.mode === 'flexible' && <div className="work-controls">
        {work.status === 'ready' && <><button type="button" className="hero-work-primary" onClick={()=>setDialogPurpose('start')}><Play size={16}/>开始工作</button><button type="button" className="hero-work-link" onClick={useScheduledToday}>今天按固定作息</button></>}
        {work.status === 'working' && <><button type="button" className="hero-work-primary" onClick={pauseWork}><Pause size={16}/>暂停</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束工作</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'paused' && <><button type="button" className="hero-work-primary" onClick={resumeWork}><Play size={16}/>继续工作</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束今天</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'ended' && <><span className="work-ended-label">{work.record?.settlementPending ? '工时已冻结，待结算' : '今天辛苦了'}</span>{work.record?.settlementPending && <button type="button" className="hero-work-primary" onClick={()=>{if(work.record)requestSettlement(work.record)}}>继续结算</button>}<button ref={settledActionRef} type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}><RotateCcw size={13}/>修正时间</button></>}
      </div>}

      {work.dayType === 'work' ? <>
        <div className={`progress-row${work.mode === 'flexible' ? ' flexible' : ''}`}><span>{work.mode === 'flexible' ? firstStart ? toLocalTimeValue(new Date(firstStart)) : '未开始' : profile.workStartTime}</span><div className="progress-track"><div className="progress-fill" style={{ width:`${progress}%` }}/><i style={{ left:`calc(${progress}% - 5px)` }}/></div><span>{work.mode === 'flexible' ? plannedEndLabel ? `预计 ${plannedEndLabel}` : `目标 ${formatDuration(targetSeconds)}` : profile.workEndTime}</span></div>
        <div className="hero-meta"><span>工作进度 <b>{progress.toFixed(0)}%</b></span><span>{work.mode === 'flexible' || isSettledDailyAmount ? '实际记录' : '已计薪'} <b>{formatDuration(worked)}</b></span><span>{isSettledDailyAmount ? '今日结算' : work.mode === 'flexible' ? '完成目标可赚' : '今日预计'} <b>{money(isSettledDailyAmount ? earned : workRates.daily)}</b></span>{work.mode === 'scheduled' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天弹性上班</button>}</div>
      </> : <>
        <div className="dashboard-day-note">{work.dayType === 'rest' ? '默认休息日不会计算工资；如果今天实际上班，可以手工开始计薪。' : work.officialHolidayName ? `已自动识别为${work.officialHolidayName}假期；你仍可在薪苦日历中手工覆盖。` : `${attendanceLabel}已覆盖今天的默认计薪安排。`}</div>
        <div className="hero-meta"><span>今日状态 <b>{work.dayType === 'rest' ? '休息' : attendanceLabel}</b></span><span>计薪方式 <b>{work.dayType === 'rest' ? '不自动计薪' : attendancePayLabel}</b></span><span>今日收入 <b>{money(earned)}</b></span>{work.dayType === 'rest' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天也上班</button>}</div>
      </>}
    </div>

    <div className="metric-grid dashboard-metric-grid">
      <article className="metric-card"><div className="metric-icon"><Clock3 size={18}/></div><p>你的时间单价</p><h3>{money(workRates.hourly)}<small> / 小时</small></h3><span>{money(workRates.minute)} / 分钟 · ¥{workRates.second.toFixed(4)} / 秒</span></article>
      <article className="metric-card accent"><div className="metric-icon"><Fish size={18}/></div><p>今日摸鱼收益</p><h3>{money(slackingMoney)}</h3><span>{formatDuration(slackingSeconds)} · {earned ? (slackingMoney / earned * 100).toFixed(1) : '0.0'}% 今日收入</span><Link to="/slacking">去摸鱼计时 →</Link></article>
      <article className="metric-card overtime-metric"><div className="metric-icon"><BriefcaseBusiness size={18}/></div><p>今日加班收入</p><h3>{money(overtimeMoney)}</h3><span>{formatDuration(overtimeSeconds)}{activeOvertime ? ' · 正在加班' : ''}</span><Link to="/overtime">去加班计时 →</Link></article>
    </div>

    <div className="section-title dashboard-performance-title"><div><p className="eyebrow">MONTHLY SCORE</p><h2>本月战绩</h2></div><span>{now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</span></div>
    <article className="dashboard-performance-card">
      <div className="dashboard-performance-primary"><div><small>本月累计收入</small><strong>{money(monthlyStats.income)}</strong><span>本月预计 {money(monthlyStats.expectedIncome)}</span></div></div>
      <div className="dashboard-performance-progress">
        <div><span>计划工时进度</span><strong>{(monthlyStats.progress * 100).toFixed(0)}%</strong></div>
        <div className="dashboard-performance-track" role="progressbar" aria-label="本月计划工时进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(monthlyStats.progress * 100)}><i style={{ width: `${monthlyStats.progress * 100}%` }} /></div>
        <small>{formatDuration(monthlyStats.workedSeconds)} / {formatDuration(monthlyStats.plannedSeconds)}</small>
      </div>
      <div className="dashboard-performance-details">
        <div><Target size={16} /><span>本月工作日</span><b>{monthlyStats.workdayCount} 天</b></div>
        <div><Clock3 size={16} /><span>累计有效工时</span><b>{formatDuration(monthlyStats.workedSeconds)}</b></div>
        <div><TrendingUp size={16} /><span>平均每小时收入</span><b>{money(monthlyStats.averageHourlyIncome)}</b></div>
      </div>
    </article>

    <div className="section-title dashboard-wishlist-title"><div><p className="eyebrow">WISH LIST</p><h2>我的心愿清单</h2></div><Link className="dashboard-wishlist-link" to="/convert">查看全部 {wishlistItems.length} 项 <ArrowUpRight size={14}/></Link></div>
    {featuredWishes.length === 0 ? <div className="dashboard-wishlist-empty"><span>✨</span><div><b>还没有心愿</b><small>把想买的东西换算成需要工作的时间。</small></div><Link to="/convert">去心愿清单</Link></div> : <div className="dashboard-wishlist-grid">
      {featuredWishes.map(item => {
        const wishProgress = featuredWishProgress.get(item.id)
        const percent = (wishProgress?.progress ?? 0) * 100
        return <article className="dashboard-wish-card" key={item.id}>
          <span className="dashboard-wish-avatar">{item.name.trim().slice(0, 1).toUpperCase() || '愿'}</span>
          <div className="dashboard-wish-main"><b>{item.name}</b><small>{money(item.price)} · 已完成 {percent.toFixed(0)}%</small></div>
          <div className="dashboard-wish-time"><small>还差纯工时</small><strong>{formatDuration(wishProgress?.remainingSeconds ?? 0)}</strong></div>
          <div className="dashboard-wish-progress" role="progressbar" aria-label={`${item.name} 的完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></div>
        </article>
      })}
    </div>}

    <WorkTimeDialog open={dialogPurpose!==null} purpose={dialogPurpose ?? 'start'} date={dialogPurpose === 'adjust' ? workDate : today} plannedStart={profile.workStartTime} record={work.record?.mode === 'flexible' ? work.record : undefined} storageError={settlementError} onStart={startAt} onAdjust={adjustTime} onCancel={closeDialog}/>
    <EarlyFinishDialog
      open={pendingEndRecord!==null}
      settlementKind={pendingRequirement === 'over-target' ? 'over-target' : 'under-target'}
      workedSeconds={pendingWorkedSeconds}
      targetSeconds={targetSeconds}
      actualAmount={pendingActualAmount}
      fullDayAmount={pendingBaseAmount}
      secondRate={workRates.second}
      error={settlementError}
      onActual={()=>settlePendingRecord('actual')}
      onFullDay={()=>settlePendingRecord('full-day')}
      onAttendance={adjustAttendance}
      onOvertime={settleFlexibleOvertime}
      onCancel={cancelPendingSettlement}
    />
  </section>
}
