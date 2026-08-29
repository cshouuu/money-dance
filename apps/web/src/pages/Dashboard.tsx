import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { ArrowUpRight, BriefcaseBusiness, Clock3, Fish, Pause, Play, RotateCcw, Sparkles, Square } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { WorkTimeDialog } from '../components/WorkTimeDialog'
import { leaveTypeLabel, loadAttendanceRecords } from '../lib/attendance'
import { toLocalDateValue, toLocalTimeValue } from '../lib/form'
import { loadProfile } from '../lib/profile'
import { calculateOvertimeEarnings } from '../lib/overtime'
import { keys, loadJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import { closeActiveWorkSession, loadWorkRecords, replaceFlexibleWorkTime, resumeFlexibleWork, saveWorkRecords, scheduledOverride, startFlexibleWork, summarizeTodayWork, upsertWorkRecord } from '../lib/work'
import type { ActiveOvertime, AttendanceRecord, DailyWorkRecord, OvertimeSession, SlackingSession, WishItem } from '../types'
import './Dashboard.css'

const money = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusLabels = {
  ready: '等待开始',
  working: '正在计薪',
  paused: '已暂停',
  ended: '今日已结束',
} as const

export function Dashboard() {
  const now = useNow(1000)
  const [profile] = useState(() => loadProfile())
  const [workRecords, setWorkRecords] = useState<DailyWorkRecord[]>(() => loadWorkRecords())
  const [attendanceRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [slackingSessions] = useState<SlackingSession[]>(() => loadJSON<SlackingSession[]>(keys.sessions, []))
  const [overtimeSessions] = useState<OvertimeSession[]>(() => loadJSON<OvertimeSession[]>(keys.overtimeSessions, []))
  const [activeOvertime] = useState<ActiveOvertime | null>(() => loadJSON<ActiveOvertime | null>(keys.activeOvertime, null))
  const [wishes] = useState<WishItem[]>(() => loadJSON<WishItem[]>(keys.wishes, []))
  const [dialogPurpose, setDialogPurpose] = useState<'start' | 'adjust' | null>(null)
  const rates = useMemo(() => calculateRates(profile), [profile])
  const work = summarizeTodayWork(profile, workRecords, now, rates, attendanceRecords)
  const earned = work.earnedAmount
  const worked = work.workedSeconds
  const progress = Math.max(0, Math.min(100, (worked / rates.paidSecondsPerDay) * 100))
  const today = toLocalDateValue(now)
  const todaySlacking = useMemo(() => slackingSessions.filter(session => toLocalDateValue(new Date(session.startTime)) === today), [slackingSessions, today])
  const slackingSeconds = useMemo(() => todaySlacking.reduce((total, session) => total + session.durationSeconds, 0), [todaySlacking])
  const slackingMoney = useMemo(() => todaySlacking.reduce((total, session) => total + session.earnedAmount, 0), [todaySlacking])
  const todayOvertime = useMemo(() => overtimeSessions.filter(session => toLocalDateValue(new Date(session.startTime)) === today), [overtimeSessions, today])
  const activeOvertimeToday = activeOvertime && toLocalDateValue(new Date(activeOvertime.startTime)) === today ? activeOvertime : null
  const activeOvertimeSeconds = activeOvertimeToday ? Math.max(0, (now.getTime() - new Date(activeOvertimeToday.startTime).getTime()) / 1000) : 0
  const overtimeSeconds = todayOvertime.reduce((total, session) => total + session.durationSeconds, 0) + activeOvertimeSeconds
  const overtimeMoney = todayOvertime.reduce((total, session) => total + session.earnedAmount, 0) + (activeOvertimeToday ? calculateOvertimeEarnings(activeOvertimeToday, activeOvertimeSeconds, rates.second) : 0)
  const wishlistItems = useMemo(() => wishes.filter(item => !item.purchasedAt), [wishes])
  const featuredWishes = wishlistItems.slice(0, 3)
  const firstStart = work.record?.sessions[0]?.startTime
  const leaveLabel = work.attendance?.status === 'leave' ? leaveTypeLabel(work.attendance.leaveType) : ''
  const attendancePayLabel = work.attendance?.payMode === 'multiplier'
    ? `${work.attendance.multiplier ?? 0} 倍计薪`
    : work.attendance?.payMode === 'fixed'
      ? `固定 ${money(work.attendance.fixedAmount ?? 0)}`
      : '不计薪'
  const heroLabel = work.dayType === 'rest' ? '今天休息' : work.dayType === 'leave' ? '今日出勤调整' : work.mode === 'flexible' ? '今日实际已赚' : '今日已经赚了'
  const modeStatus = work.dayType === 'rest'
    ? '非工作日 · 不自动计薪'
    : work.dayType === 'leave'
      ? `${leaveLabel} · ${attendancePayLabel}`
      : work.mode === 'flexible'
        ? statusLabels[work.status]
        : '固定作息 · 自动计薪'

  const persistRecord = useCallback((record: DailyWorkRecord) => {
    setWorkRecords(current => {
      const next = upsertWorkRecord(current, record)
      saveWorkRecords(next)
      return next
    })
  }, [])

  const closeDialog = useCallback(() => setDialogPurpose(null), [])
  const startAt = useCallback((time: string) => {
    persistRecord(startFlexibleWork(today, time, work.record))
    setDialogPurpose(null)
  }, [persistRecord, today, work.record])
  const adjustTime = useCallback((startTime: string, endTime?: string) => {
    persistRecord(replaceFlexibleWorkTime(today, startTime, endTime))
    setDialogPurpose(null)
  }, [persistRecord, today])
  const pauseWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(closeActiveWorkSession(work.record, 'paused'))
  }, [work.record, persistRecord])
  const endWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(closeActiveWorkSession(work.record, 'ended'))
  }, [work.record, persistRecord])
  const resumeWork = useCallback(() => {
    if (work.record?.mode === 'flexible') persistRecord(resumeFlexibleWork(work.record))
  }, [work.record, persistRecord])
  const useScheduledToday = useCallback(() => persistRecord(scheduledOverride(today)), [persistRecord, today])

  return <section className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">{now.toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'long' })}</p><h1>今天的时间，正在变成钱。</h1></div><Link className="ghost-button" to="/settings">薪资设置 <ArrowUpRight size={16}/></Link></header>

    <div className={`hero-card${work.dayType === 'work' && work.mode === 'flexible' ? ' flexible-work' : ''}`}>
      <div className="hero-glow" />
      <div className="hero-heading-row"><p className="hero-label"><Sparkles size={16}/> {heroLabel}</p><span className="hero-mode-status">{modeStatus}</span></div>
      <div className="money-ticker">{money(earned)}</div>
      <p className="rate-line">{work.dayType === 'rest' ? '休息日不自动计薪' : work.dayType === 'leave' ? '已按照薪苦日历中的出勤设置计算' : `+ ¥${rates.second.toFixed(5)} / 秒`}</p>

      {work.dayType === 'work' && work.mode === 'flexible' && <div className="work-controls">
        {work.status === 'ready' && <><button type="button" className="hero-work-primary" onClick={()=>setDialogPurpose('start')}><Play size={16}/>开始工作</button><button type="button" className="hero-work-link" onClick={useScheduledToday}>今天按固定作息</button></>}
        {work.status === 'working' && <><button type="button" className="hero-work-primary" onClick={pauseWork}><Pause size={16}/>暂停</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束工作</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'paused' && <><button type="button" className="hero-work-primary" onClick={resumeWork}><Play size={16}/>继续工作</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束今天</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'ended' && <><span className="work-ended-label">今天辛苦了</span><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}><RotateCcw size={13}/>修正时间</button></>}
      </div>}

      {work.dayType === 'work' ? <>
        <div className={`progress-row${work.mode === 'flexible' ? ' flexible' : ''}`}><span>{work.mode === 'flexible' ? firstStart ? toLocalTimeValue(new Date(firstStart)) : '未开始' : profile.workStartTime}</span><div className="progress-track"><div className="progress-fill" style={{ width:`${progress}%` }}/><i style={{ left:`calc(${progress}% - 5px)` }}/></div><span>{work.mode === 'flexible' ? `目标 ${formatDuration(rates.paidSecondsPerDay)}` : profile.workEndTime}</span></div>
        <div className="hero-meta"><span>工作进度 <b>{progress.toFixed(0)}%</b></span><span>已计薪 <b>{formatDuration(worked)}</b></span><span>{work.mode === 'flexible' ? '完成目标可赚' : '今日预计'} <b>{money(rates.daily)}</b></span>{work.mode === 'scheduled' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天弹性上班</button>}</div>
      </> : <>
        <div className="dashboard-day-note">{work.dayType === 'rest' ? '默认休息日不会计算工资；如果今天实际上班，可以手工开始计薪。' : `${leaveLabel}已覆盖今天的默认计薪安排。`}</div>
        <div className="hero-meta"><span>今日状态 <b>{work.dayType === 'rest' ? '休息' : leaveLabel}</b></span><span>计薪方式 <b>{work.dayType === 'rest' ? '不自动计薪' : attendancePayLabel}</b></span><span>今日收入 <b>{money(earned)}</b></span>{work.dayType === 'rest' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天也上班</button>}</div>
      </>}
    </div>

    <div className="metric-grid dashboard-metric-grid">
      <article className="metric-card"><div className="metric-icon"><Clock3 size={18}/></div><p>你的时间单价</p><h3>{money(rates.hourly)}<small> / 小时</small></h3><span>{money(rates.minute)} / 分钟 · ¥{rates.second.toFixed(4)} / 秒</span></article>
      <article className="metric-card accent"><div className="metric-icon"><Fish size={18}/></div><p>今日摸鱼收益</p><h3>{money(slackingMoney)}</h3><span>{formatDuration(slackingSeconds)} · {earned ? (slackingMoney / earned * 100).toFixed(1) : '0.0'}% 今日收入</span><Link to="/slacking">去摸鱼计时 →</Link></article>
      <article className="metric-card overtime-metric"><div className="metric-icon"><BriefcaseBusiness size={18}/></div><p>今日加班收入</p><h3>{money(overtimeMoney)}</h3><span>{formatDuration(overtimeSeconds)}{activeOvertimeToday ? ' · 正在加班' : ''}</span><Link to="/overtime">去加班计时 →</Link></article>
    </div>

    <div className="section-title dashboard-wishlist-title"><div><p className="eyebrow">WISH LIST</p><h2>我的心愿清单</h2></div><Link className="dashboard-wishlist-link" to="/convert">查看全部 {wishlistItems.length} 项 <ArrowUpRight size={14}/></Link></div>
    {featuredWishes.length === 0 ? <div className="dashboard-wishlist-empty"><span>✨</span><div><b>还没有心愿</b><small>把想买的东西换算成需要工作的时间。</small></div><Link to="/convert">去心愿清单</Link></div> : <div className="dashboard-wishlist-grid">
      {featuredWishes.map(item => {
        const seconds = priceToWorkSeconds(item.price, rates.second)
        return <article className="dashboard-wish-card" key={item.id}><span className="dashboard-wish-avatar">{item.name.trim().slice(0,1).toUpperCase() || '愿'}</span><div className="dashboard-wish-main"><b>{item.name}</b><small>{money(item.price)}</small></div><div className="dashboard-wish-time"><small>需要工作</small><strong>{formatDuration(seconds)}</strong></div></article>
      })}
    </div>}

    <WorkTimeDialog open={dialogPurpose!==null} purpose={dialogPurpose ?? 'start'} date={today} plannedStart={profile.workStartTime} record={work.record?.mode === 'flexible' ? work.record : undefined} onStart={startAt} onAdjust={adjustTime} onCancel={closeDialog}/>
  </section>
}
