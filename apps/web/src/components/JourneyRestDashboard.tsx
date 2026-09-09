import { BookOpen, Boxes, Coffee, Plus, Route } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SalaryProfile } from '@salary-flow/core'
import { journeyDateCount } from '../lib/workJourney'
import { toLocalDateValue } from '../lib/form'
import { shiftSessionLocalDate } from '../lib/sessionBusinessDate'
import { WorkWorthNote } from '../pages/WorkJourney'
import '../pages/WorkJourney.css'

export function JourneyRestDashboard({ profile, now }: { profile: SalaryProfile; now: Date }) {
  const [worth, setWorth] = useState(false)
  const stages = profile.workJourney?.stages ?? []
  const previous = stages.find(stage => stage.endDate && stage.endDate < toLocalDateValue(now))
  const next = stages.find(stage => stage.startDate > toLocalDateValue(now))
  const restDays = previous?.endDate ? journeyDateCount(shiftSessionLocalDate(previous.endDate, 1), toLocalDateValue(now)) : 0
  return <div className="page journey-page journey-rest-dashboard">
    <header className="journey-heading"><div><p className="journey-eyebrow">A LITTLE ROOM FOR LIFE</p><h1>今日<span>按自己的节奏生活。</span></h1></div><Link className="journey-button" to="/journey"><Route size={16}/>工作旅程</Link></header>
    <section className="journey-hero"><div><span className="journey-hero-label"><Coffee size={17}/>{restDays ? `休息第 ${restDays} 天` : '暂时休息'}</span><h2>今天，把时间留给自己。</h2><p>原工作的自动计薪已停止，过去的努力都好好保存在工作旅程里。</p><p>{next ? `${next.name} 将于 ${next.startDate} 开始。` : '准备好时，再开启下一段工作。'}</p><div className="journey-actions"><Link className="journey-button" to="/journey"><Plus size={16}/>{next ? '查看下一段工作' : '开启新工作'}</Link><button className="journey-button" onClick={() => setWorth(true)}>了解 WorkWorth</button></div></div></section>
    {previous && <div className="journey-reflection" style={{ marginBottom: 26, marginTop: 0 }}><Route size={23}/><div><h3>最近一段工作 · {previous.name}</h3><p>{previous.startDate} — {previous.endDate} · {journeyDateCount(previous.startDate, previous.endDate!)} 天</p><Link className="journey-text-button" to="/journey">回看这段旅程 →</Link></div></div>}
    <section className="journey-rest-links"><Link to="/summary"><BookOpen size={22}/><b>生活账本继续记录</b><span>记录日常收支；尾薪、补发和奖金仍可手动入账。</span></Link><Link to="/assets"><Boxes size={22}/><b>看看陪伴你的物品</b><span>使用时间与每日成本，继续按实际日期更新。</span></Link><Link to="/journey"><Route size={22}/><b>每一段，都算数</b><span>回看工作历程、每日薪资与投入的时间。</span></Link></section>
    {worth && <WorkWorthNote close={() => setWorth(false)}/>}
  </div>
}
