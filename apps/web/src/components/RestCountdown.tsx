import { BriefcaseBusiness, CalendarDays, Clock3, Coffee, Gift, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { getRestCountdown } from '../lib/restCountdown'
import { countdownClock } from '../lib/restCountdown'
import type { PaydayCountdown } from '../lib/payday'
import { toLocalTimeValue } from '../lib/form'
import './RestCountdown.css'

export function RestCountdown({ value, payday, now }: { value: ReturnType<typeof getRestCountdown>; payday: PaydayCountdown | null; now: Date }) {
  return <section className="rest-countdown" aria-label="盼头倒计时">
    <div className="rest-countdown-heading"><h2><Clock3 size={18}/>盼头倒计时</h2><span>按你的作息</span></div>
    {payday ? <Link className="rest-countdown-feature rest-countdown-payday" to="/settings" aria-label="查看发薪日设置"><div><span>距离发薪</span><strong>{payday.daysRemaining === 0 ? '今天发薪' : `还有 ${payday.daysRemaining} 天`}</strong><small>{payday.adjusted ? '本次调整至' : '下次发薪'} {payday.nextPayday.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ›</small></div><Wallet size={42} strokeWidth={1.3}/></Link>
      : <div className="rest-countdown-feature"><div><span>{value.featured.label}</span><strong>{value.featured.target ? countdownClock(value.featured.target, now) : value.featured.label === '今天已下班' ? '今天辛苦了' : '享受此刻'}</strong><small>{value.featured.hint}</small><Link className="rest-countdown-setup" to="/settings">设置发薪日 ›</Link></div><Coffee size={42} strokeWidth={1.3}/></div>}
    <div className="rest-countdown-grid">
      <div className="rest-countdown-tile"><BriefcaseBusiness size={22}/><span>离下班</span><strong>{value.end ? countdownClock(value.end, now) : value.endLabel}</strong><small>{value.end ? `${toLocalTimeValue(value.end)} 结束工作` : '以实际工作安排为准'}</small></div>
      <div className="rest-countdown-tile"><Coffee size={22}/><span>{value.lunch.label}</span><strong>{value.lunch.target ? countdownClock(value.lunch.target, now) : value.lunch.hint}</strong><small>{value.lunch.target ? value.lunch.hint : '以实际工作安排为准'}</small></div>
      <div className="rest-countdown-tile"><CalendarDays size={22}/><span>离休息日</span><strong>{value.rest ? value.rest.days === 0 ? '今天休息' : `${value.rest.days} 天` : '暂无安排'}</strong><small>{value.rest?.hint ?? '未来一年暂无休息日'}</small></div>
      <div className="rest-countdown-tile"><Gift size={22}/><span>离节假日</span><strong>{value.holiday ? value.holiday.days === 0 ? '假期中' : `${value.holiday.days} 天` : '暂无数据'}</strong><small>{value.holiday?.hint ?? '以已启用的节假日日历为准'}</small></div>

    </div>
  </section>
}
