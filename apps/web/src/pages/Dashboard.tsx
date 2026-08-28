import { calculateEarnedToday, calculateRates, formatDuration, getWorkedPaidSeconds } from '@salary-flow/core'
import { ArrowUpRight, Clock3, Fish, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useNow } from '../lib/useNow'
import { toLocalDateValue } from '../lib/form'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON } from '../lib/storage'
import type { SlackingSession } from '../types'

const money = (n: number) => `¥${n.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`

export function Dashboard() {
  const now = useNow(100)
  const profile = loadProfile()
  const rates = useMemo(() => calculateRates(profile), [JSON.stringify(profile)])
  const earned = calculateEarnedToday(profile, now)
  const worked = getWorkedPaidSeconds(profile, now)
  const progress = Math.max(0, Math.min(100, (worked / rates.paidSecondsPerDay) * 100))
  const sessions = loadJSON<SlackingSession[]>(keys.sessions, [])
  const today = toLocalDateValue(now)
  const todaySlacking = sessions.filter(s => toLocalDateValue(new Date(s.startTime)) === today)
  const slackingSeconds = todaySlacking.reduce((a, s) => a + s.durationSeconds, 0)
  const slackingMoney = todaySlacking.reduce((a, s) => a + s.earnedAmount, 0)

  return <section className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">{now.toLocaleDateString('zh-CN', {month:'long', day:'numeric', weekday:'long'})}</p><h1>今天的时间，正在变成钱。</h1></div><Link className="ghost-button" to="/settings">薪资设置 <ArrowUpRight size={16}/></Link></header>

    <div className="hero-card">
      <div className="hero-glow" />
      <p className="hero-label"><Sparkles size={16}/> 今日已经赚了</p>
      <div className="money-ticker">{money(earned)}</div>
      <p className="rate-line">+ ¥{rates.second.toFixed(5)} / 秒</p>
      <div className="progress-row"><span>{profile.workStartTime}</span><div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}}/><i style={{left:`calc(${progress}% - 5px)`}}/></div><span>{profile.workEndTime}</span></div>
      <div className="hero-meta"><span>工作进度 <b>{progress.toFixed(0)}%</b></span><span>已计薪 <b>{formatDuration(worked)}</b></span><span>今日预计 <b>{money(rates.daily)}</b></span></div>
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
  </section>
}
