import { calculateRates, formatDuration } from '@salary-flow/core'
import { ArrowUpRight, Clock3, Fish, Pause, Play, RotateCcw, Sparkles, Square } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { WorkTimeDialog } from '../components/WorkTimeDialog'
import { toLocalDateValue, toLocalTimeValue } from '../lib/form'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import { closeActiveWorkSession, loadWorkRecords, replaceFlexibleWorkTime, resumeFlexibleWork, saveWorkRecords, scheduledOverride, startFlexibleWork, summarizeTodayWork, upsertWorkRecord } from '../lib/work'
import type { DailyWorkRecord, SlackingSession } from '../types'

const money = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusLabels = {
  ready: '等待开始',
  working: '正在计薪',
  paused: '已暂停',
  ended: '今日已结束',
} as const

export function Dashboard() {
  const now = useNow(100)
  const [profile] = useState(() => loadProfile())
  const [workRecords, setWorkRecords] = useState<DailyWorkRecord[]>(() => loadWorkRecords())
  const [slackingSessions] = useState<SlackingSession[]>(() => loadJSON<SlackingSession[]>(keys.sessions, []))
  const [dialogPurpose, setDialogPurpose] = useState<'start' | 'adjust' | null>(null)
  const rates = useMemo(() => calculateRates(profile), [profile])
  const work = summarizeTodayWork(profile, workRecords, now, rates)
  const earned = work.earnedAmount
  const worked = work.workedSeconds
  const progress = Math.max(0, Math.min(100, (worked / rates.paidSecondsPerDay) * 100))
  const today = toLocalDateValue(now)
  const todaySlacking = useMemo(() => slackingSessions.filter(session => toLocalDateValue(new Date(session.startTime)) === today), [slackingSessions, today])
  const slackingSeconds = useMemo(() => todaySlacking.reduce((total, session) => total + session.durationSeconds, 0), [todaySlacking])
  const slackingMoney = useMemo(() => todaySlacking.reduce((total, session) => total + session.earnedAmount, 0), [todaySlacking])
  const firstStart = work.record?.sessions[0]?.startTime

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

    <div className={`hero-card${work.mode === 'flexible' ? ' flexible-work' : ''}`}>
      <div className="hero-glow" />
      <div className="hero-heading-row"><p className="hero-label"><Sparkles size={16}/> {work.mode === 'flexible' ? '今日实际已赚' : '今日已经赚了'}</p><span className="hero-mode-status">{work.mode === 'flexible' ? statusLabels[work.status] : '固定作息 · 自动计薪'}</span></div>
      <div className="money-ticker">{money(earned)}</div>
      <p className="rate-line">+ ¥{rates.second.toFixed(5)} / 秒</p>

      {work.mode === 'flexible' && <div className="work-controls">
        {work.status === 'ready' && <><button type="button" className="hero-work-primary" onClick={()=>setDialogPurpose('start')}><Play size={16}/>开始工作</button><button type="button" className="hero-work-link" onClick={useScheduledToday}>今天按固定作息</button></>}
        {work.status === 'working' && <><button type="button" className="hero-work-primary" onClick={pauseWork}><Pause size={16}/>暂停</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束工作</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'paused' && <><button type="button" className="hero-work-primary" onClick={resumeWork}><Play size={16}/>继续工作</button><button type="button" className="hero-work-secondary" onClick={endWork}><Square size={15}/>结束今天</button><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}>修正时间</button></>}
        {work.status === 'ended' && <><span className="work-ended-label">今天辛苦了</span><button type="button" className="hero-work-link" onClick={()=>setDialogPurpose('adjust')}><RotateCcw size={13}/>修正时间</button></>}
      </div>}

      <div className={`progress-row${work.mode === 'flexible' ? ' flexible' : ''}`}><span>{work.mode === 'flexible' ? firstStart ? toLocalTimeValue(new Date(firstStart)) : '未开始' : profile.workStartTime}</span><div className="progress-track"><div className="progress-fill" style={{ width:`${progress}%` }}/><i style={{ left:`calc(${progress}% - 5px)` }}/></div><span>{work.mode === 'flexible' ? `目标 ${formatDuration(rates.paidSecondsPerDay)}` : profile.workEndTime}</span></div>
      <div className="hero-meta"><span>工作进度 <b>{progress.toFixed(0)}%</b></span><span>已计薪 <b>{formatDuration(worked)}</b></span><span>{work.mode === 'flexible' ? '完成目标可赚' : '今日预计'} <b>{money(rates.daily)}</b></span>{work.mode === 'scheduled' && <button type="button" className="hero-mode-switch" onClick={()=>setDialogPurpose('start')}>今天弹性上班</button>}</div>
    </div>

    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><Clock3 size={18}/></div><p>你的时间单价</p><h3>{money(rates.hourly)}<small> / 小时</small></h3><span>{money(rates.minute)} / 分钟 · ¥{rates.second.toFixed(4)} / 秒</span></article>
      <article className="metric-card accent"><div className="metric-icon"><Fish size={18}/></div><p>今日摸鱼收益</p><h3>{money(slackingMoney)}</h3><span>{formatDuration(slackingSeconds)} · {earned ? (slackingMoney / earned * 100).toFixed(1) : '0.0'}% 今日收入</span><Link to="/slacking">去摸鱼计时 →</Link></article>
    </div>

    <div className="section-title"><div><p className="eyebrow">QUICK ACTIONS</p><h2>把价格换成人生时间</h2></div></div>
    <div className="quick-cards">
      {[['☕','一杯咖啡',32],['🎧','AirPods Pro',1899],['📱','一部手机',7999]].map(([emoji,name,price]) => {
        const seconds = Number(price) / rates.second
        return <Link to={`/convert?name=${encodeURIComponent(String(name))}&price=${price}`} className="quick-card" key={String(name)}><span className="emoji">{emoji}</span><div><b>{name}</b><small>¥{price}</small></div><strong>{formatDuration(seconds)}</strong></Link>
      })}
    </div>

    <WorkTimeDialog open={dialogPurpose!==null} purpose={dialogPurpose ?? 'start'} date={today} plannedStart={profile.workStartTime} record={work.record?.mode === 'flexible' ? work.record : undefined} onStart={startAt} onAdjust={adjustTime} onCancel={closeDialog}/>
  </section>
}
