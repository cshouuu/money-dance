import { rosterDayLabel } from '../lib/roster'
import { actualPaidIntervalsInRange } from '../lib/paidTime'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isEmployedOn, parseClock, rosterForDate, rosterShiftsForDate, type RosterPlan, type SalaryProfile, type ShiftTemplate } from '@salary-flow/core'
import { Button, Input, SelectField, Switch } from '../ui/BeuiControls'
import { useProfile } from '../lib/useProfile'
import { createId } from '../lib/id'
import { localDateWithTime, toLocalDateValue } from '../lib/form'
import { isSessionLocalDate, shiftSessionLocalDate } from '../lib/sessionBusinessDate'
import { effectiveRosterShifts, intervalSeconds, shiftDuration, shiftHours, shiftIntervals } from '../lib/roster'
import { saveRosterPlans, validateRoster } from '../lib/rosterStorage'
import { getMonthlyWorkStats, plannedIncomeForDate } from '../lib/monthlyStats'
import { loadWorkRecords } from '../lib/work'
import { loadAttendanceRecords } from '../lib/attendance'
import { loadLedger } from '../lib/ledger'
import './Roster.css'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const newShift = (): ShiftTemplate => ({ id: createId(), name: '新班次', color: 'primary', startTime: '09:00', endTime: '18:00', endDay: 0, breaks: [], amount: 0, allowance: 0 })
const money = (value: number) => `¥${value.toFixed(2)}`
function templatePlan(profile: SalaryProfile, stageId: string | null): RosterPlan {
  const today = toLocalDateValue()
  const stage = profile.workJourney?.stages.find(item => item.id === stageId)
  const start = stage && stage.startDate > today ? stage.startDate : stage?.endDate && stage.endDate < today ? stage.endDate : today
  const existing = rosterForDate(profile, start)
  const first = newShift()
  const future = existing && (!stage?.endDate || stage.endDate>start) ? shiftSessionLocalDate(start,1) : start
  return existing ? { ...clone(existing), id: createId(), effectiveFrom: future, overrides: existing.overrides.filter(item => item.date >= future) } : {
    id: createId(), stageId, effectiveFrom: start, enabled: true, mode: 'manual', anchorDate: start,
    templates: [first], cycle: [[first.id], [], [], []], overrides: [], respectVacations: true, respectHolidays: false,
    pay: { mode: ['monthly','annual'].includes(stage?.profile?.salaryType ?? profile.salaryType) ? 'salary' : 'hourly', value: 0, basis: 'planned', monthlyHours: 0, overtime: 'manual', overtimeValue: 1.5 },
  }
}

function ShiftEditor({ shift, change, remove }: { shift: ShiftTemplate; change: (value: ShiftTemplate) => void; remove: () => void }) {
  const patch = (value: Partial<ShiftTemplate>) => change({ ...shift, ...value })
  const numeric = (value: string) => value === '' ? NaN : Number(value)
  const clock = (minute: number) => { const total = Math.max(0, Math.round(parseClock(shift.startTime) / 60 + minute)); return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}` }
  const day = (minute: number) => Math.floor((parseClock(shift.startTime) / 60 + minute) / 1440)
  const restPatch = (id: string, value: Partial<ShiftTemplate['breaks'][number]>) => patch({ breaks: shift.breaks.map(item => item.id === id ? { ...item, ...value } : item) })
  let duration = 0; let paid = 0
  try { duration = shiftDuration(shift); paid = intervalSeconds(shiftIntervals(shift, '2026-01-01')) } catch { /* Keep incomplete inputs editable. */ }
  return <article className="roster-template">
    <div className="roster-grid"><Input label="班次名称" maxLength={40} value={shift.name} onValueChange={name => patch({ name })}/><SelectField label="标识颜色" value={shift.color} onValueChange={color => patch({ color })}><option value="primary">主题主色</option><option value="secondary">主题辅助色</option><option value="muted">柔和色</option></SelectField></div>
    <div className="roster-grid"><Input label="开始时间" type="time" value={shift.startTime} onValueChange={startTime => { if (startTime) patch({ startTime }) }}/><Input label="结束时间" type="time" value={shift.endTime} onValueChange={endTime => { if (endTime) patch({ endTime }) }}/><Input label="结束在第几天后" type="number" min={0} max={31} step={1} value={Number.isFinite(shift.endDay) ? String(shift.endDay) : ''} onValueChange={value => patch({ endDay: numeric(value) })} hint="0 为当天，1 为次日；24 小时班次请选择 1"/></div>
    <p className="roster-note">班次跨度 {shiftHours(duration)} · 工作时长 {shiftHours(Math.max(0,duration-shift.breaks.reduce((sum,item)=>sum+(item.endMinute-item.startMinute)*60,0)))} · 计薪时长 {shiftHours(paid)}</p>
    <details><summary>休息与班次金额</summary>
      {shift.breaks.map(rest => <div key={rest.id} className="roster-rest"><Input label="休息名称" value={rest.name} onValueChange={name => restPatch(rest.id,{ name })}/><div className="roster-grid"><Input label="休息开始时间" type="time" value={clock(rest.startMinute)} onValueChange={value => { if(value) restPatch(rest.id,{ startMinute: day(rest.startMinute) * 1440 + parseClock(value)/60 - parseClock(shift.startTime)/60 }) }}/><Input label="开始在第几天后" type="number" min={0} max={31} value={String(day(rest.startMinute))} onValueChange={value => restPatch(rest.id,{ startMinute: Number(value)*1440 + parseClock(clock(rest.startMinute))/60 - parseClock(shift.startTime)/60 })}/><Input label="休息结束时间" type="time" value={clock(rest.endMinute)} onValueChange={value => { if(value) restPatch(rest.id,{ endMinute: day(rest.endMinute)*1440 + parseClock(value)/60 - parseClock(shift.startTime)/60 }) }}/><Input label="结束在第几天后" type="number" min={0} max={31} value={String(day(rest.endMinute))} onValueChange={value => restPatch(rest.id,{ endMinute: Number(value)*1440 + parseClock(clock(rest.endMinute))/60 - parseClock(shift.startTime)/60 })}/></div><div className="roster-actions"><Switch checked={rest.paid} onCheckedChange={paid => restPatch(rest.id,{ paid })} ariaLabel={`${rest.name}计薪`}/><span>这段休息计薪</span><Button variant="ghost" size="sm" onClick={() => patch({ breaks: shift.breaks.filter(item => item.id !== rest.id) })}>删除休息</Button></div></div>)}
      <Button variant="secondary" size="sm" onClick={() => patch({ breaks: [...shift.breaks,{ id:createId(),name:'休息',startMinute:180,endMinute:240,paid:false }] })}>添加休息时段</Button>
      <div className="roster-grid"><Input label="每班工资（按班计薪时使用）" type="number" min={0} step="0.01" value={Number.isFinite(shift.amount) ? String(shift.amount) : ''} onValueChange={value => patch({ amount:numeric(value) })}/><Input label="每班补贴（元）" type="number" min={0} step="0.01" value={Number.isFinite(shift.allowance) ? String(shift.allowance) : ''} onValueChange={value => patch({ allowance:numeric(value) })}/></div>
    </details><Button size="sm" variant="ghost" onClick={remove}>删除此班次</Button>
  </article>
}

function Editor({ profile, stageId }: { profile: SalaryProfile; stageId: string | null }) {
  const [search] = useSearchParams()
  const [draft,setDraft] = useState(() => templatePlan(profile,stageId))
  const [expected,setExpected] = useState(profile)
  const [tab,setTab] = useState<'rules'|'day'>(search.get('date')?'day':'rules')
  const [date,setDate] = useState(search.get('date') ?? toLocalDateValue())
  const [endDate,setEndDate] = useState(date)
  const [dayShifts,setDayShifts] = useState<ShiftTemplate[]>(() => clone(rosterShiftsForDate(profile,date)))
  const initialOverride=rosterForDate(profile,date)?.overrides.find(item=>item.date===date)
  const [amount,setAmount] = useState(initialOverride?.amount===undefined?'':String(initialOverride.amount))
  const [reason,setReason] = useState(initialOverride?.reason??'')
  const [keepVacationPay,setKeepVacationPay] = useState(initialOverride?.keepVacationPay??false)
  const [copyWeek,setCopyWeek] = useState(false)
  const [review,setReview] = useState<{ plans: RosterPlan[]; start:string; end:string } | null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const patch = (value:Partial<RosterPlan>) => {setDraft(current => ({...current,...value}));setError('')}
  const pay = (value:Partial<RosterPlan['pay']>) => patch({pay:{...draft.pay,...value}})
  const selectedPlan = rosterForDate(profile,date)
  const templates = tab === 'rules' ? draft.templates : selectedPlan?.templates ?? []
  const chooseDate = (value:string) => {setDate(value);setEndDate(value);setDayShifts(clone(rosterShiftsForDate(profile,value)));const override=rosterForDate(profile,value)?.overrides.find(item=>item.date===value);setAmount(override?.amount === undefined ? '' : String(override.amount));setReason(override?.reason ?? '');setKeepVacationPay(override?.keepVacationPay ?? false);setError('')}
  const prepare = (reset=false) => {
    setNotice('')
    if(tab==='rules' && (!isSessionLocalDate(draft.effectiveFrom) || !isSessionLocalDate(draft.anchorDate))) {setError('请选择有效的生效日期与循环起点。');return}
    if(tab==='day' && (!isSessionLocalDate(date) || !isSessionLocalDate(endDate))) {setError('请选择有效的起始日期和结束日期。');return}
    let plans = clone(profile.rosters ?? [])
    let first = tab==='rules'?draft.effectiveFrom:date; let last = shiftSessionLocalDate(first,13)
    if(tab==='rules') {
      const next = {...draft,stageId,overrides:draft.overrides.filter(item=>item.date>=draft.effectiveFrom)}
      const matching=plans.find(item=>item.stageId===stageId && item.effectiveFrom===next.effectiveFrom)
      if(matching) next.id=matching.id
      plans=[...plans.filter(item=>item.id!==next.id),next]
    } else {
      first=date;last=endDate
      if(!date || endDate<date || (Date.parse(endDate)-Date.parse(date))/86400000>365) {setError('批量范围需为 1–366 天。');return}
      if(amount.trim() && (!Number.isFinite(Number(amount)) || Number(amount)<0)) {setError('请填写有效的最终工资。');return}
      for(let key=date;key<=endDate;key=shiftSessionLocalDate(key,1)) {
        const owner=rosterForDate({...profile,rosters:plans},key)
        if(!owner || owner.stageId!==stageId) {setError(`${key} 尚未启用这份工作的排班，请先设置生效日期。`);return}
        owner.overrides=owner.overrides.filter(item=>item.date!==key)
        if(!reset) owner.overrides.push({date:key,shifts:clone(copyWeek ? rosterShiftsForDate(profile,shiftSessionLocalDate(key,-7)) : dayShifts),reason,keepVacationPay,...(amount.trim() ? {amount:Number(amount)} : {})})
      }
    }
    const next={...profile,rosters:plans}
    for(const item of plans) {if(JSON.stringify(profile.rosters?.find(old=>old.id===item.id))===JSON.stringify(item))continue;const invalid=validateRoster(item,next);if(invalid){setError(invalid);return}}
    setReview({plans,start:first,end:last});setError('')
  }
  const preview = useMemo(() => {
    if(!review) return null
    const next={...profile,rosters:review.plans};const records=loadWorkRecords();const attendance=loadAttendanceRecords();const ledger=loadLedger()
    const at=new Date(`${review.start.slice(0,7)}-15T12:00:00`)
    const rows=[]
    for(let date=review.start;date<=review.end && rows.length<31;date=shiftSessionLocalDate(date,1)) rows.push({date,label:rosterDayLabel(next,date)??(isEmployedOn(next,date)?'原作息':'未任职'),shifts:effectiveRosterShifts(next,date),hours:intervalSeconds(actualPaidIntervalsInRange(next,localDateWithTime(date,'00:00'),localDateWithTime(shiftSessionLocalDate(date,1),'00:00'),[],attendance)),pay:plannedIncomeForDate(next,date,attendance)})
    return { rows,before:getMonthlyWorkStats(profile,ledger,records,attendance,at).expectedIncome,after:getMonthlyWorkStats(next,ledger,records,attendance,at).expectedIncome }
  },[review,profile])
  const save = async () => {
    if(!review||busy)return
    setBusy(true)
    const failed=await saveRosterPlans(expected,review.plans)
    setBusy(false)
    if(failed){setError(failed);return}
    const next={...expected,rosters:review.plans}
    setExpected(next);setDraft(templatePlan(next,stageId))
    setDayShifts(clone(rosterShiftsForDate(next,date)))
    const override=rosterForDate(next,date)?.overrides.find(item=>item.date===date)
    setAmount(override?.amount===undefined?'':String(override.amount))
    setReason(override?.reason??'');setKeepVacationPay(override?.keepVacationPay??false)
    setReview(null);setError('');setNotice('排班已保存，日历、首页和计薪已同步更新。')
  }
  return <div className="roster-content">
    <div className="roster-actions"><Button variant={tab==='rules'?'primary':'secondary'} onClick={()=>{setTab('rules');setReview(null)}}>班次与规则</Button><Button variant={tab==='day'?'primary':'secondary'} onClick={()=>{setTab('day');setReview(null)}}>单日 / 批量调整</Button></div>
    {notice&&<p role="status">{notice}</p>}
    {review&&preview ? <section className="roster-card"><h2>保存前预览</h2><p>{review.start} 至 {review.end}。{review.start<toLocalDateValue()?'涉及历史日期，相关自动工资会重算。':'只影响所选日期起的安排。'}实际计时、手工账本记录均保留。</p><p>{review.start.slice(0,7)} 月预计收入：{money(preview.before)} → <b>{money(preview.after)}</b></p><div className="roster-preview">{preview.rows.map(row=><div key={row.date}><b>{row.date}</b><span>{row.shifts.map(shift=>`${shift.name} ${shift.startTime}–${shift.endDay?`+${shift.endDay}天 `:''}${shift.endTime}`).join(' / ')||row.label}</span><small>{shiftHours(row.hours)} · {money(row.pay)}</small></div>)}</div><p className="roster-note">最多展示前 31 天；按班收入记在开班日期，跨月工时按实际日期拆分。额外加班以实际记录为准。</p><div className="roster-actions"><Button variant="secondary" onClick={()=>setReview(null)} disabled={busy}>返回修改</Button><Button onClick={save} disabled={busy}>{busy?'保存中…':'确认保存'}</Button></div></section> : tab==='rules' ? <>
      <section className="roster-card"><h2>排班方式</h2><div className="roster-actions"><Switch checked={draft.enabled} onCheckedChange={enabled=>patch({enabled})} ariaLabel="启用排班"/><span>从生效日期起使用排班</span></div><div className="roster-grid"><Input label="生效日期" type="date" min="1900-01-01" value={draft.effectiveFrom} onValueChange={effectiveFrom=>patch({effectiveFrom})}/><SelectField label="排班方式" value={draft.mode} onValueChange={mode=>patch({mode:mode as RosterPlan['mode'],cycle:mode==='weekly'?Array.from({length:7},(_,i)=>draft.cycle[i]??[]):draft.cycle})}><option value="manual">手动安排</option><option value="weekly">按周重复</option><option value="cycle">自定义循环</option></SelectField></div><p className="roster-note">关闭排班后恢复原作息；已保存的历史版本保留。临时调班不改变循环顺序。</p></section>
      {draft.enabled&&<><section className="roster-card"><h2>班次模板</h2>{draft.templates.map(shift=><ShiftEditor key={shift.id} shift={shift} change={next=>patch({templates:draft.templates.map(item=>item.id===shift.id?next:item)})} remove={()=>patch({templates:draft.templates.filter(item=>item.id!==shift.id),cycle:draft.cycle.map(day=>day.filter(id=>id!==shift.id))})}/>)}<Button variant="secondary" onClick={()=>patch({templates:[...draft.templates,newShift()]})}>添加班次模板</Button></section>
      {draft.mode!=='manual'&&<section className="roster-card"><h2>{draft.mode==='weekly'?'每周安排':'循环顺序'}</h2><div className="roster-grid"><Input label={draft.mode==='weekly'?'开始重复日期':'循环第 1 天日期'} type="date" value={draft.anchorDate} onValueChange={anchorDate=>patch({anchorDate})}/>{draft.mode==='cycle'&&<Input label="循环天数" type="number" min={1} max={366} value={String(draft.cycle.length)} onValueChange={value=>{const length=Number(value);if(Number.isInteger(length)&&length>=1&&length<=366)patch({cycle:Array.from({length},(_,i)=>draft.cycle[i]??[])})}}/>}</div><div className="roster-cycle">{draft.cycle.map((day,index)=><div key={index}><b>{draft.mode==='weekly'?['周一','周二','周三','周四','周五','周六','周日'][index]:`第 ${index+1} 天`}</b><div className="roster-actions"><Button size="sm" variant={day.length?'secondary':'primary'} onClick={()=>patch({cycle:draft.cycle.map((item,i)=>i===index?[]:item)})}>休息</Button>{draft.templates.map(shift=><Button key={shift.id} size="sm" aria-pressed={day.includes(shift.id)} variant={day.includes(shift.id)?'primary':'secondary'} onClick={()=>patch({cycle:draft.cycle.map((item,i)=>i!==index?item:item.includes(shift.id)?item.filter(id=>id!==shift.id):[...item,shift.id])})}>{shift.name}</Button>)}</div></div>)}</div><p className="roster-note">一天可选多个不重叠班次；24 小时以上班次占用的后续日期通常设为休息。</p></section>}
      <section className="roster-card"><h2>计薪方式</h2><SelectField label="基本工资" value={draft.pay.mode} onValueChange={mode=>pay({mode:mode as RosterPlan['pay']['mode']})}><option value="salary">保留月薪 / 年薪</option><option value="hourly">按小时计薪</option><option value="shift">按班次固定金额</option></SelectField>{draft.pay.mode==='hourly'&&<Input label="每小时金额（元）" type="number" min={0} step="0.01" value={String(draft.pay.value)} onValueChange={value=>pay({value:value.trim()?Number(value):NaN})}/>}<SelectField label="工时与班次结算依据" value={draft.pay.basis} onValueChange={basis=>pay({basis:basis as 'planned'|'actual'})}><option value="planned">按计划计薪；结束时发放班次工资及补贴</option><option value="actual">按实际工时；完成整班后发放班次工资及补贴</option></SelectField><p className="roster-note">月薪 / 年薪按自然日分摊基本工资，不因跨日多发日薪。按班或按小时输入到手金额，基本工资扣除不再重复扣。固定金额遇到提前下班，可在单日调整中确认最终工资。</p><details><summary>高级：工时折算、超时与假期</summary><Input label="每月标准计薪工时" type="number" min={0} step="0.5" value={String(draft.pay.monthlyHours)} onValueChange={value=>pay({monthlyHours:value.trim()?Number(value):NaN})} hint="0 表示按当月原计划计薪工时折算；没有工时时单价为 0，固定工资保留"/><SelectField label="超出本班计划工时" value={draft.pay.overtime} onValueChange={overtime=>pay({overtime:overtime as RosterPlan['pay']['overtime']})}><option value="manual">结束时手工确认 / 另记加班</option><option value="unpaid">不额外计薪，保留工时</option><option value="multiplier">自动按时薪倍率计薪</option><option value="fixed">结束后按固定金额计薪</option></SelectField>{['multiplier','fixed'].includes(draft.pay.overtime)&&<Input label={draft.pay.overtime==='multiplier'?'超时工资倍率':'本次超时固定金额'} type="number" min={0} step="0.01" value={String(draft.pay.overtimeValue)} onValueChange={value=>pay({overtimeValue:value.trim()?Number(value):NaN})}/>}<div className="roster-actions"><Switch checked={draft.respectVacations} onCheckedChange={respectVacations=>patch({respectVacations})} ariaLabel="寒暑假覆盖排班"/><span>寒暑假等个人假期覆盖常规排班</span></div><div className="roster-actions"><Switch checked={draft.respectHolidays} onCheckedChange={respectHolidays=>patch({respectHolidays})} ariaLabel="国家节假日覆盖排班"/><span>国家节假日自动休息</span></div><p className="roster-note">假期以班次开始日期判断；已经开始的长班持续到其结束时间。单日明确安排优先。</p></details></section></>}
      <Button onClick={()=>prepare()}>预览并保存规则</Button>
    </> : <section className="roster-card"><h2>手动排班 / 临时调班</h2><div className="roster-grid"><Input label="起始日期" type="date" value={date} onValueChange={chooseDate}/><Input label="结束日期" type="date" min={date} value={endDate} onValueChange={setEndDate}/></div><p className="roster-note">日期指班次开始日；跨日班次的休息、调班和结算都在开班日设置。同一天填相同日期，连续日期应用同一组班次，也可复制前一周。</p><div className="roster-actions"><Switch checked={copyWeek} onCheckedChange={setCopyWeek} ariaLabel="复制前一周"/><span>复制前一周对应日期的班次</span></div>{!copyWeek&&<><div className="roster-actions">{templates.map(shift=><Button variant="secondary" size="sm" key={shift.id} onClick={()=>setDayShifts([...dayShifts,{...clone(shift),id:createId()}])}>添加 {shift.name}</Button>)}</div>{dayShifts.map((shift,index)=><ShiftEditor key={shift.id} shift={shift} change={next=>setDayShifts(dayShifts.map((item,i)=>i===index?next:item))} remove={()=>setDayShifts(dayShifts.filter((_,i)=>i!==index))}/>)}{!dayShifts.length&&<p>这一天休息，不安排班次。</p>}</>}<details><summary>特殊工资与调整原因</summary><Input label="每日最终工资（元，可留空）" type="number" min={0} step="0.01" value={amount} onValueChange={setAmount} hint="覆盖这一天所有班次的基本工资和补贴；独立记录的加班仍保留。"/><Input label="调整原因" maxLength={200} value={reason} onValueChange={setReason}/><div className="roster-actions"><Switch checked={keepVacationPay} onCheckedChange={setKeepVacationPay} ariaLabel="值班保留假期工资"/><span>值班沿用假期工资，避免重复计薪</span></div></details><div className="roster-actions"><Button onClick={()=>prepare()}>预览调整</Button><Button variant="secondary" onClick={()=>prepare(true)}>恢复所选日期的常规排班</Button></div></section>}
    {error&&<p role="alert" className="roster-error">{error}</p>}
    <details className="roster-card"><summary>已保存的规则版本</summary>{(profile.rosters??[]).filter(item=>item.stageId===stageId).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)).map(item=><p key={item.id}>{item.effectiveFrom} 起 · {item.enabled?item.mode==='manual'?'手动排班':item.mode==='weekly'?'按周重复':`${item.cycle.length} 天循环`:'恢复原作息'}</p>)}</details>
  </div>
}

export function Roster() {
  const profile=useProfile();const [search]=useSearchParams()
  const available=profile.workJourney?.stages.filter(stage=>stage.profile)??[]
  const [stageId,setStageId]=useState<string|null>(()=>(search.get('stage')||null)??available.find(stage=>stage.startDate<=toLocalDateValue()&&(!stage.endDate||stage.endDate>=toLocalDateValue()))?.id??available[0]?.id??null)
  return <section className="page roster-page"><header className="page-header"><div><p className="eyebrow">OPTIONAL SCHEDULE</p><h1>排班设置</h1><p>为轮班、长班和不固定作息设置自己的安排。</p></div><Link className="text-button" to="/attendance">返回薪苦日历</Link></header>{available.length>0&&<SelectField label="所属工作" value={stageId??''} onValueChange={setStageId}>{available.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</SelectField>}{profile.workJourney&&!available.length?<p>请先在工作旅程中补充工作和薪资。</p>:<Editor key={stageId??'current'} profile={profile} stageId={stageId}/>}</section>
}
