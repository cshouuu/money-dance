import { useEffect, useState, type FormEvent } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import { Input, Button, SelectField } from '../ui/BeuiControls'
import { createId } from '../lib/id'
import { cancelTimerPlan, loadTimerPlans, saveTimerPlan, TIMER_PLANS_KEY, TIMER_PLANS_UPDATED, type TimerPlan, type TimerPlanKind } from '../lib/timerPlans'
import { STORAGE_CHANGED_EVENT } from '../lib/storage'
import { overtimePayLabel } from '../lib/overtime'
import './TimerPlans.css'

const localInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const displayTime = (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const statusLabels = { scheduled: '待开始', running: '计时中', completed: '已完成', conflict: '待处理', cancelled: '已取消' }

export function TimerPlans({ kind }: { kind: TimerPlanKind }) {
  const label = kind === 'overtime' ? '加班' : '摸鱼'
  const [plans, setPlans] = useState(loadTimerPlans)
  const [editing, setEditing] = useState<TimerPlan | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const refresh = () => setPlans(loadTimerPlans())
    const storage = (event: Event) => { const key = event instanceof StorageEvent ? event.key : (event as CustomEvent).detail?.key; if (!key || key === TIMER_PLANS_KEY) refresh() }
    window.addEventListener(TIMER_PLANS_UPDATED, refresh)
    window.addEventListener('storage', storage)
    window.addEventListener(STORAGE_CHANGED_EVENT, storage)
    return () => { window.removeEventListener(TIMER_PLANS_UPDATED, refresh); window.removeEventListener('storage', storage); window.removeEventListener(STORAGE_CHANGED_EVENT, storage) }
  }, [])
  const edit = (plan?: TimerPlan) => {
    const next = plan ?? { id: createId(), kind, startTime: new Date(Date.now() + 3600_000).toISOString(), status: 'scheduled' as const, payMode: 'unpaid' as const }
    setEditing(next)
    setStart(localInput(new Date(next.startTime)))
    setEnd(next.endTime ? localInput(new Date(next.endTime)) : '')
    setAmount(String(next.payMode === 'fixed' ? next.fixedAmount ?? '' : next.multiplier ?? ''))
    setError('')
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || !event.currentTarget.reportValidity()) return
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : null
    if (!Number.isFinite(startDate.getTime()) || (endDate && !Number.isFinite(endDate.getTime()))) { setError('请选择有效的日期和时间。'); return }
    const result = saveTimerPlan({ ...editing, kind, startTime: startDate.toISOString(), endTime: endDate?.toISOString(), multiplier: editing.payMode === 'multiplier' ? Number(amount) : undefined, fixedAmount: editing.payMode === 'fixed' ? Number(amount) : undefined })
    setError(result ?? '')
    if (!result) { setEditing(null); setPlans(loadTimerPlans()) }
  }
  const items = plans.filter(plan => plan.kind === kind).sort((a, b) => {
    const pending = (plan: TimerPlan) => ['running', 'conflict', 'scheduled'].includes(plan.status) ? 0 : 1
    return pending(a) - pending(b) || new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  })
  return <section className="timer-plans" aria-label={`${label}预约`}>
    <div className="timer-plans-heading"><h2><CalendarClock size={20}/>{label}预约</h2><Button type="button" variant="secondary" size="sm" onClick={() => edit()}><Plus size={15}/>新增预约</Button></div>
    <p className="timer-plans-copy">可添加多个未来时段，每条执行一次。应用打开时到点开始；关闭后再次打开，按计划时间补算。</p>
    {editing && <form className="timer-plan-editor" onSubmit={save}>
      <h3>{plans.some(plan => plan.id === editing.id) ? '修改预约' : `预约${label}`}</h3>
      <Input label="预约开始时间" required type="datetime-local" value={start} onValueChange={setStart}/>
      <Input label="预约结束时间" type="datetime-local" hint="选填；留空则手动结束，到点若同类计时冲突，后续预约暂停执行。" value={end} onValueChange={setEnd}/>
      {kind === 'overtime' && <><SelectField label="加班费类型" value={editing.payMode} onValueChange={value => { setEditing({ ...editing, payMode: value as TimerPlan['payMode'] }); setAmount('') }}><option value="unpaid">无偿加班，只记时间</option><option value="multiplier">按工资倍率</option><option value="fixed">固定加班费</option></SelectField>{editing.payMode !== 'unpaid' && <Input label={editing.payMode === 'fixed' ? '本次固定加班费' : '工资倍率'} required type="number" min="0.01" step="0.01" value={amount} onValueChange={setAmount}/>}</>}
      <div className="timer-plan-actions"><Button type="button" variant="secondary" onClick={() => { setEditing(null); setError('') }}>取消编辑</Button><Button type="submit">保存预约</Button></div>
    </form>}
    {error && <p role="alert" className="timer-plan-error">{error}</p>}
    {!items.length && !editing && <p className="timer-plans-empty">还没有预约，提前安排下一段{label}吧。</p>}
    <div className="timer-plan-list">{items.map(plan => <article key={plan.id} className={`timer-plan-row ${plan.status}`}>
      <div><strong>{displayTime(plan.startTime)}</strong><small>{plan.endTime ? `至 ${displayTime(plan.endTime)} · 到点停止` : '手动结束'}{kind === 'overtime' ? ` · ${overtimePayLabel(plan)}` : ''}</small>{plan.message && <p role="status">{plan.message}</p>}</div><span className="timer-plan-status">{statusLabels[plan.status]}</span>
      {['scheduled', 'conflict'].includes(plan.status) && <div className="timer-plan-actions"><button type="button" onClick={() => edit(plan)}>修改</button><button type="button" onClick={() => { if (!cancelTimerPlan(plan.id)) setError('预约已开始或取消失败，请刷新后重试。'); else { setPlans(loadTimerPlans()); if (editing?.id === plan.id) setEditing(null) } }}>取消预约</button></div>}
      {plan.status === 'running' && <small className="timer-plan-running-note">可使用上方计时器提前结束。</small>}
    </article>)}</div>
  </section>
}
