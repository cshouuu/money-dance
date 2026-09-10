import { rosterForDate } from '@salary-flow/core'
import { rosterActualIntervals, rosterPayForDate, intervalSeconds, shiftHours } from '../lib/roster'
import { useProfile } from '../lib/useProfile'
import { vacationPayLabel } from '../lib/vacations'
import { vacationForDate, isEmployedOn, type SalaryProfile } from '@salary-flow/core'
import { JourneyRestDashboard } from '../components/JourneyRestDashboard'
import { useTimerPlanSync } from '../components/TimerPlanController'
import { calculateRates, formatDuration } from '@salary-flow/core'
import { ArrowUpRight, BriefcaseBusiness, Clock3, Fish, Pause, Play, RotateCcw, Sparkles, Square } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EarlyFinishDialog } from '../components/EarlyFinishDialog'
import { WorkTimeDialog } from '../components/WorkTimeDialog'
import { MonthlyPerformance } from '../components/MonthlyPerformance'
import { NumberTicker } from '../ui/NumberTicker'
import { loadAchievementState, reconcileAchievementSessions, saveAchievementState } from '../lib/achievements'
import { alternatingWeekTypeForDate, attendancePayModeLabel, attendanceStatusLabel, attendanceWorkedFraction, isConfiguredWorkday, isHalfDayLeave, loadAttendanceRecords, loadChinaHolidaySettings } from '../lib/attendance'
import { localDateWithTime, toLocalDateValue, toLocalTimeValue } from '../lib/form'
import { replaceScheduledWorkTime } from '../lib/work'
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
import { RestCountdown } from '../components/RestCountdown'
import { getRestCountdown } from '../lib/restCountdown'
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
  const profile = useProfile()
  const now = useNow(1000)
  const work = summarizeTodayWork(profile, loadWorkRecords(), now)
  return !isEmployedOn(profile, work.businessDate)
    ? <JourneyRestDashboard profile={profile} now={now}/>
    : <WorkingDashboard profile={profile}/>
}

function WorkingDashboard({ profile }: { profile: SalaryProfile }) {
  const navigate = useNavigate()
  const now = useNow(1000)
  const [workRecords, setWorkRecords] = useState<DailyWorkRecord[]>(() => loadWorkRecords())
  const workRecordsRef = useRef(workRecords)
  const settledActionRef = useRef<HTMLButtonElement>(null)
  const [attendanceRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [holidaySettings] = useState(() => loadChinaHolidaySettings())
  const [ledger, setLedger] = useState(() => loadLedger())
  const [slackingSessions, setSlackingSessions] = useState<SlackingSession[]>(loadSlackingSessions)
  const [overtimeSessions, setOvertimeSessions] = useState<OvertimeSession[]>(loadOvertimeSessions)
  const [activeOvertime, setActiveOvertime] = useState<ActiveOvertime | null>(() => loadJSON<ActiveOvertime | null>(keys.activeOvertime, null))
  const [wishes] = useState<WishItem[]>(() => loadJSON<WishItem[]>(keys.wishes, []))
  const [dialogPurpose, setDialogPurpose] = useState<'start' | 'adjust' | null>(null)
  const [pendingEndRecord, setPendingEndRecord] = useState<DailyWorkRecord | null>(() => {
    const currentRecord = getCurrentWorkRecord(workRecords, new Date())
    return currentRecord?.settlementPending ? currentRecord : null
  })
  const [settlementError, setSettlementError] = useState('')
  const settlingRef = useRef(false)
  useTimerPlanSync(() => { setLedger(loadLedger()); setSlackingSessions(loadSlackingSessions()); setOvertimeSessions(loadOvertimeSessions()); setActiveOvertime(loadJSON<ActiveOvertime | null>(keys.activeOvertime, null)) })
  const today = toLocalDateValue(now)
  const currentMinute = Math.floor(now.getTime() / 60_000)
  const currentRates = useMemo(() => calculateRates(
    salaryProfileForBusinessDate(profile, today, attendanceRecords, holidaySettings),
  ), [attendanceRecords, holidaySettings, profile, today])
  const paydayCountdown = getPaydayCountdown(profile.payday, now, {
    adjustment: profile.paydayAdjustment,
    // A personal school vacation does not move the payroll calendar.
    isWorkday: date => isConfiguredWorkday(date, { ...profile, vacations: undefined }, holidaySettings),
  })
  const work = summarizeTodayWork(profile, workRecords, now, undefined, attendanceRecords)
  const restCountdown = useMemo(() => getRestCountdown(profile, work, new Date(currentMinute * 60_000), attendanceRecords, workRecords, holidaySettings), [profile, work.businessDate, work.dayType, work.status, work.record, currentMinute, attendanceRecords, workRecords, holidaySettings])
  const workRates = useMemo(() => calculateRates(
    salaryProfileForBusinessDate(profile, work.businessDate, attendanceRecords, holidaySettings),
  ), [attendanceRecords, holidaySettings, profile, work.businessDate])
  const roster = rosterForDate(profile,work.businessDate)
  const rosterExpected = roster ? rosterPayForDate(profile,work.businessDate,new Date(8640000000000000),[],attendanceRecords,holidaySettings) ?? 0 : 0
  const scheduleStart = work.rosterStart ? toLocalTimeValue(new Date(work.rosterStart)) : profile.workStartTime
  const scheduleEnd = work.rosterEnd ? `${toLocalDateValue(new Date(work.rosterEnd)) === work.businessDate ? '' : `${toLocalDateValue(new Date(work.rosterEnd))} `}${toLocalTimeValue(new Date(work.rosterEnd))}` : profile.workEndTime
  const targetSeconds = workRates.paidSecondsPerDay * attendanceWorkedFraction(work.attendance)
  const earned = work.earnedAmount
  const worked = work.workedSeconds
  const progress = targetSeconds > 0 ? Math.max(0, Math.min(100, (worked / targetSeconds) * 100)) : 0
  const hasReachedFlexibleTarget = work.mode === 'flexible' && worked >= targetSeconds
  const workDate = work.businessDate
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
    now,
    { overtime: overtimeSessions, slacking: slackingSessions },
  ), [attendanceRecords, currentMinute, ledger, profile, workRecords, overtimeSessions, slackingSessions])
  const firstStart = work.record?.sessions[0]?.startTime
  const plannedEndLabel = work.record?.plannedEndTime
    ? `${toLocalDateValue(new Date(work.record.plannedEndTime)) === workDate ? '' : '次日 '}${toLocalTimeValue(new Date(work.record.plannedEndTime))}`
    : null
  const vacation = vacationForDate(profile, work.businessDate)
  const attendanceLabel = work.vacationName ?? (work.attendance ? attendanceStatusLabel(work.attendance) : vacation ? `${vacation.name} · 值班` : work.officialHolidayName ?? '')
  const customAttendancePayLabel = work.attendance ? attendancePayModeLabel(work.attendance) : null
  const attendancePayLabel = customAttendancePayLabel ?? (vacation ? vacationPayLabel(vacation) : null) ?? (work.attendance ? '不计薪' : work.dayType === 'holiday' ? earned > 0 ? '正常日薪' : '不计薪' : '')
  const isNormalPayOverride = work.attendance?.status === 'normal' && customAttendancePayLabel !== null
  const isAttendanceOverride = work.dayType === 'leave' || work.dayType === 'holiday' || isNormalPayOverride || isHalfDayLeave(work.attendance) || !!vacation
  const isFullDaySettlement = isFlexibleFullDaySettlement(work.record, profile.salaryType)
  const isSettledDailyAmount = isFullDaySettlement || isNormalPayOverride || isHalfDayLeave(work.attendance) || !!vacation || (work.mode === 'scheduled' && work.status === 'ended')
  const heroLabel = roster ? roster.pay.mode==='salary'?(work.businessDate===toLocalDateValue(now)?'今日工资':'开班日工资'):work.dayType==='work'?'本班工资与补贴':'排班休息' : work.vacationName ? `${work.vacationName}中 · 今日假期工资` : work.dayType === 'rest' ? '今天休息' : work.dayType === 'holiday' ? '今天放假' : work.dayType === 'leave' ? '今日出勤调整' : isSettledDailyAmount ? '今日工作收入' : work.mode === 'flexible' ? '今日实际已赚' : '今日已经赚了'
  const modeStatus = roster ? `${work.rosterName ?? '排班'} · ${work.status === 'ended' ? '已结束' : work.status === 'ready' ? '等待开班' : work.status === 'paused' ? '已暂停' : '按排班计薪'}` : work.vacationName && vacation ? `仍在职 · ${vacationPayLabel(vacation)}` : work.dayType === 'rest'
    ? '非工作日 · 不自动计薪'
    : isAttendanceOverride
      ? `${attendanceLabel} · ${attendancePayLabel}`
      : work.mode === 'flexible'
        ? work.record?.settlementPending
          ? '已停止 · 等待结算'
          : isFullDaySettlement ? '正常出勤 · 全天计薪' : statusLabels[work.status]
        : work.status === 'ended' ? '固定作息 · 已下班' : profile.workWeekMode === 'alternating'
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
    const workedSeconds = roster ? intervalSeconds(rosterActualIntervals(profile,frozen.date,new Date(frozen.updatedAt),[frozen],attendanceRecords),new Date(frozen.updatedAt)) : getFlexibleWorkedSeconds(frozen, new Date(frozen.updatedAt))
    const automaticMode = roster && roster.pay.overtime !== 'manual' ? 'actual' : getAutomaticFlexibleSettlementMode(profile.salaryType, workedSeconds, targetSeconds, isAttendanceOverride || !!roster)
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
  }, [focusSettledAction, isAttendanceOverride, persistRecord, profile, roster, attendanceRecords, removeLinkedFlexibleOvertime, targetSeconds])
  const startAt = useCallback((time: string, plannedEndTime?: string) => {
    const started = startFlexibleWork(roster ? workDate : today, time, work.record, plannedEndTime)
    if (!commitFlexibleWorkStart(() => persistRecord(started))) {
      setSettlementError('开始工作暂时无法保存，计时尚未启动。请释放设备存储空间后重试。')
      return
    }
    setSettlementError('')
    setDialogPurpose(null)
  }, [persistRecord, today, work.record, roster, workDate])
  const adjustTime = useCallback((startTime: string, endTime?: string, endDate?: string) => {
    if (work.mode === 'scheduled') {
      if (!persistRecord(replaceScheduledWorkTime(workDate, startTime, endTime, endDate ?? workDate))) {
        setSettlementError('修正时间暂时无法保存，请重试。')
        return
      }
      closeDialog()
      return
    }
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
  }, [closeDialog, persistRecord, removeLinkedFlexibleOvertime, requestSettlement, work.mode, work.record, workDate])
  const pauseWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(closeActiveWorkSession(work.record, 'paused'))
  }, [work.record, persistRecord])
  const endWork = useCallback(() => {
    if (work.mode === 'scheduled') {
      const end = new Date()
      const start = work.record?.sessions[0]?.startTime ?? work.rosterStart ?? localDateWithTime(workDate, profile.workStartTime).toISOString()
      if (new Date(start) >= end) return
      if (!persistRecord(replaceScheduledWorkTime(workDate, toLocalTimeValue(new Date(start)), toLocalTimeValue(end), toLocalDateValue(end)))) {
        setSettlementError('下班时间暂时无法保存，请重试。')
      }
      return
    }
    if (work.record?.mode !== 'flexible') return
    requestSettlement(freezeFlexibleWorkForSettlement(work.record))
  }, [persistRecord, profile.workStartTime, work.mode, work.record, work.rosterStart, workDate, requestSettlement])
  const resumeWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(resumeFlexibleWork(work.record))
  }, [work.record, persistRecord])
  const useScheduledToday = useCallback(() => {
    if (!persistRecord(scheduledOverride(workDate))) setSettlementError('今天的工作安排暂时无法保存，请重试。')
  }, [persistRecord, workDate])
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
    const overtimeRecord = roster ? { ...pendingEndRecord, sessions: rosterActualIntervals(profile,pendingEndRecord.date,new Date(pendingEndRecord.updatedAt),[pendingEndRecord],attendanceRecords).map((item,index)=>({id:String(index),startTime:item.start.toISOString(),endTime:item.end.toISOString()})) } : pendingEndRecord
    const window = getFlexibleOvertimeWindow(overtimeRecord, targetSeconds, new Date(pendingEndRecord.updatedAt))
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
  }, [focusSettledAction, pendingEndRecord, persistRecord, targetSeconds, workRates.second, roster, profile, attendanceRecords])
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
  const pendingWorkedSeconds = pendingEndRecord && roster ? intervalSeconds(rosterActualIntervals(profile,pendingEndRecord.date,new Date(pendingEndRecord.updatedAt),[pendingEndRecord],attendanceRecords),new Date(pendingEndRecord.updatedAt)) : pendingEndRecord ? getFlexibleWorkedSeconds(pendingEndRecord, new Date(pendingEndRecord.updatedAt)) : 0
  const pendingRequirement = getFlexibleSettlementRequirement(pendingWorkedSeconds, targetSeconds)
  const pendingActualAmount = pendingEndRecord ? getFlexibleEarnedAmount({ ...pendingEndRecord, settlementMode: 'actual' }, workRates, profile.salaryType, new Date(pendingEndRecord.updatedAt)) : 0
  const pendingBaseAmount = getFlexibleBaseSettlementAmount(work.attendance, workRates.daily, vacation || roster ? work.earnedAmount : null)

  useEffect(() => {
    if (work.record?.mode !== 'flexible' || !hasFlexiblePlannedEndReached(work.record, now)) return
    requestSettlement(freezeFlexibleWorkForSettlement(work.record, now))
  }, [now, requestSettlement, work.record])

  return <section className="page dashboard-page">
    <header className="page-header">
      <div><p className="eyebrow">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>今天的时间，正在变成钱。</h1></div>
      <div className="dashboard-header-actions">
        <Link className="ghost-button" to="/settings">薪资设置 <ArrowUpRight size={16} /></Link>
      </div>
    </header>

    <div className="dashboard-overview-grid">
    <div className={`hero-card${work.dayType === 'work' && work.mode === 'flexible' ? ' flexible-work' : ''}`}>
      <div className="hero-glow" />
      <div className="hero-heading-row"><p className="hero-label"><Sparkles size={16}/> {heroLabel}</p><span className="hero-mode-status">{modeStatus}</span></div>
      <NumberTicker className="money-ticker" value={earned * 100} format={moneyFromCents} duration={0.38} stagger={0} startOnView={false} />
      <p className="rate-line">{roster ? roster.pay.mode==='salary'?'固定工资按自然日分摊，休息不产生工时':roster.pay.mode==='shift'?'完成班次后按固定金额结算；跨日不重复计薪':`按计薪工时计算 · ¥${roster.pay.value}/小时` : work.dayType === 'rest'
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
                : work.status === 'ended' ? '已下班，按实际工时结算' : `+ ¥${workRates.second.toFixed(5)} / 秒`}</p>

      {work.dayType === 'work' && work.mode === 'scheduled' && <div className="work-controls">
        {work.status === 'ended' ? <span className="work-ended-label">今天辛苦了 · 已下班</span> : <button type="button" className="hero-work-secondary" disabled={(work.rosterStart ? new Date(work.rosterStart) : localDateWithTime(workDate, profile.workStartTime)) >= now} onClick={endWork}><Square size={15}/>结束工作</button>}
        <button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button>
        {settlementError && <span role="alert">{settlementError}</span>}
      </div>}
      {work.dayType === 'work' && work.mode === 'flexible' && <div className="work-controls">
        {work.status === 'ready' && <><button type="button" className="hero-work-primary" onClick={()=>setDialogPurpose('start')}><Play size={16}/>开始工作</button><button type="button" className="hero-work-link" onClick={useScheduledToday}>今天按固定作息</button></>}
        {work.status === 'working' && <><button type="button" className="hero-work-primary" onClick={pauseWork}><Pause size={16}/>暂停</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束工作</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'paused' && <><button type="button" className="hero-work-primary" onClick={resumeWork}><Play size={16}/>继续工作</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束今天</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'ended' && <><span className="work-ended-label">{work.record?.settlementPending ? '工时已冻结，待结算' : '今天辛苦了'}</span>{work.record?.settlementPending && <button type="button" className="hero-work-primary" onClick={()=>{if(work.record)requestSettlement(work.record)}}>继续结算</button>}<button ref={settledActionRef} type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}><RotateCcw size={13}/>修正时间</button></>}
      </div>}

      {work.dayType === 'work' ? <>
        <div className={`progress-row${work.mode === 'flexible' ? ' flexible' : ''}${roster ? ' roster-progress' : ''}`}><span>{firstStart ? toLocalTimeValue(new Date(firstStart)) : work.mode === 'flexible' ? '未开始' : scheduleStart}</span><div className="progress-track"><div className="progress-fill" style={{ width:`${progress}%` }}/><i style={{ left:`calc(${progress}% - 5px)` }}/></div><span>{work.mode === 'flexible' ? plannedEndLabel ? `预计 ${plannedEndLabel}` : `目标 ${formatDuration(targetSeconds)}` : work.record?.sessions.at(-1)?.endTime ? toLocalTimeValue(new Date(work.record.sessions.at(-1)!.endTime!)) : plannedEndLabel ? `预计 ${plannedEndLabel}` : work.record?.sessions.length ? '手动结束' : scheduleEnd}</span></div>
        <div className="hero-meta"><span>工作进度 <b>{progress.toFixed(0)}%</b></span><span>{work.mode === 'flexible' || isSettledDailyAmount ? '实际记录' : '已计薪'} <b>{roster || worked>=86400 ? shiftHours(worked) : formatDuration(worked)}</b></span><span>{isSettledDailyAmount ? '今日结算' : work.mode === 'flexible' ? '完成目标可赚' : '今日预计'} <b>{money(roster ? rosterExpected : isSettledDailyAmount ? earned : workRates.daily)}</b></span>{work.mode === 'scheduled' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天弹性上班</button>}</div>
      </> : <>
        <div className="dashboard-day-note">{roster ? '按排班规则计算本日工资。临时值班可从薪苦日历调整班次。' : work.dayType === 'rest' ? '默认休息日不会计算工资；如果今天实际上班，可以手工开始计薪。' : work.officialHolidayName ? `已自动识别为${work.officialHolidayName}假期；你仍可在薪苦日历中手工覆盖。` : `${attendanceLabel}已覆盖今天的默认计薪安排。`}</div>
        <div className="hero-meta"><span>今日状态 <b>{work.dayType === 'rest' ? '休息' : attendanceLabel}</b></span><span>计薪方式 <b>{roster ? roster.pay.mode==='salary'?'保留固定工资':'按排班规则' : work.dayType === 'rest' ? '不自动计薪' : attendancePayLabel}</b></span><span>今日收入 <b>{money(earned)}</b></span>{work.dayType === 'rest' && !roster && <><button type="button" className="hero-mode-switch" onClick={useScheduledToday}>今天也上班 · 按平时作息</button><button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天弹性上班</button></>}</div>
      </>}
    </div>

    <div className="dashboard-countdown-overview">
    <RestCountdown value={restCountdown} payday={paydayCountdown} now={now}/>
    <aside className="dashboard-insights" aria-label="今日概览">
      <div className="dashboard-insights-heading"><div><p className="eyebrow">TODAY OVERVIEW</p><h2>今日概览</h2></div><span>{work.vacationName ? `${work.vacationName}中` : work.dayType === 'work' ? work.status === 'ended' ? '已下班' : '计薪中' : '今日休息'}</span></div>
      <div className="dashboard-insight-grid dashboard-insight-grid-compact">
        <Link className="dashboard-insight-card" to="/settings">
          <span className="dashboard-insight-card-heading"><i><Clock3 size={16}/></i><b>时间单价</b></span>
          <strong>{money(workRates.hourly)}<em>/ 小时</em></strong>
          <small>{money(workRates.minute)} / 分钟</small>
          <ArrowUpRight className="dashboard-insight-arrow" size={15}/>
        </Link>
        <Link className="dashboard-insight-card" to="/slacking">
          <span className="dashboard-insight-card-heading"><i><Fish size={16}/></i><b>摸鱼收益</b></span>
          <strong>{money(slackingMoney)}</strong>
          <small>{formatDuration(slackingSeconds)} · {earned ? (slackingMoney / earned * 100).toFixed(1) : '0.0'}% 今日收入</small>
          <ArrowUpRight className="dashboard-insight-arrow" size={15}/>
        </Link>
        <Link className="dashboard-insight-card" to="/overtime">
          <span className="dashboard-insight-card-heading"><i><BriefcaseBusiness size={16}/></i><b>加班收入</b></span>
          <strong>{money(overtimeMoney)}</strong>
          <small>{formatDuration(overtimeSeconds)}{activeOvertime ? ' · 正在加班' : ''}</small>
          <ArrowUpRight className="dashboard-insight-arrow" size={15}/>
        </Link>
      </div>
    </aside>
    </div>
    </div>

    <MonthlyPerformance stats={monthlyStats} now={now}/>

    <div className="section-title dashboard-wishlist-title"><div><p className="eyebrow">WISH LIST</p><h2>我的心愿清单</h2></div><Link className="dashboard-wishlist-link" to="/convert">查看全部 {wishlistItems.length} 项 <ArrowUpRight size={14}/></Link></div>
    {featuredWishes.length === 0 ? <div className="dashboard-wishlist-empty"><span>✨</span><div><b>还没有心愿</b><small>把想买的东西换算成需要工作的时间。</small></div><Link to="/convert">去心愿清单</Link></div> : <div className="dashboard-wishlist-grid">
      {featuredWishes.map(item => {
        const wishProgress = featuredWishProgress.get(item.id)
        const percent = (wishProgress?.progress ?? 0) * 100
        const remainingSeconds = wishProgress?.remainingSeconds ?? 0
        const remainingWorkDays = remainingSeconds === 0 ? 0 : currentRates.paidSecondsPerDay > 0 ? remainingSeconds / currentRates.paidSecondsPerDay : Number.POSITIVE_INFINITY
        return <article className="dashboard-wish-card" key={item.id}>
          <span className="dashboard-wish-avatar">{item.name.trim().slice(0, 1).toUpperCase() || '愿'}</span>
          <div className="dashboard-wish-main"><b>{item.name}</b><small>{money(item.price)} · {wishProgress?.upcomingStart ? `尚未开始 · ${toLocalDateValue(wishProgress.upcomingStart)}` : `已完成 ${percent.toFixed(0)}%`}</small></div>
          <div className="dashboard-wish-time"><small>还差纯工时</small><strong>{formatDuration(remainingSeconds)}</strong><small className="dashboard-wish-days" title="按当前设置的每天计薪工时折算，不包含休息日">{Number.isFinite(remainingWorkDays) ? <>{remainingWorkDays > 0 && remainingWorkDays < 0.01 ? '不足' : '约'} <b>{remainingWorkDays > 0 && remainingWorkDays < 0.01 ? '0.01' : remainingWorkDays.toFixed(2)}</b> 个工作日</> : '暂无法折算工作日'}</small></div>
          <div className="dashboard-wish-progress" role="progressbar" aria-label={`${item.name} 的完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></div>
        </article>
      })}
    </div>}

    <WorkTimeDialog open={dialogPurpose!==null} purpose={dialogPurpose ?? 'start'} date={dialogPurpose === 'adjust' || roster ? workDate : today} plannedStart={scheduleStart} record={work.record} storageError={settlementError} onStart={startAt} onAdjust={adjustTime} onCancel={closeDialog}/>
    <EarlyFinishDialog
      open={pendingEndRecord!==null}
      settlementKind={pendingRequirement === 'over-target' ? 'over-target' : 'under-target'}
      workedSeconds={pendingWorkedSeconds}
      targetSeconds={targetSeconds}
      actualAmount={pendingActualAmount}
      fullDayAmount={pendingBaseAmount}
      basePayLabel={vacation ? `${vacation.name}工资` : roster ? '本班基本工资' : undefined}
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
