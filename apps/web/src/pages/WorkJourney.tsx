import { rosterForDate } from '@salary-flow/core'
import { rosterStandardDayAmount } from '../lib/roster'
import { stageVacationSummary, vacationRange, vacationPayLabel } from '../lib/vacations'
import { VacationSettingsButton } from '../components/VacationSettings'
import { DEFAULT_PROFILE, calculateRates, getBreakPeriods, type SalaryProfile, type WorkStage } from '@salary-flow/core'
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Check, ChevronRight, Coffee, Flag, Plus, Route, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toLocalDateValue } from '../lib/form'
import { useProfile } from '../lib/useProfile'
import { useNow } from '../lib/useNow'
import { commitJourney, journeyDateCount, journeyElapsedDays, journeyStageLabel, newWorkStage, plansOutsideJourney, profileSnapshot, stageDays, stageDateImpact, stageSupplementalIncome, validateWorkStage } from '../lib/workJourney'
import { useModalViewport } from '../components/useModalViewport'
import { shiftSessionLocalDate } from '../lib/sessionBusinessDate'
import { salaryProfileForBusinessDate } from '../lib/profile'
import { Button, Checkbox, Input, SelectField, Tabs, TabsTrigger } from '../ui/BeuiControls'
import { BouncyAccordion } from '../ui/BouncyAccordion'
import './WorkJourney.css'

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
const dates = (stage: WorkStage) => `${stage.startDate.replaceAll('-', '.')} — ${stage.endDate?.replaceAll('-', '.') ?? '至今'}`
const salaryLabels = { monthly: '月薪', annual: '年薪', daily: '日薪', hourly: '时薪' }
type Editor = { kind: 'create' | 'history' | 'edit' | 'end'; stage?: WorkStage }

export function JourneyDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useModalViewport(true)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  return <dialog ref={ref} className="journey-dialog" aria-labelledby="journey-dialog-title" onCancel={event => { event.preventDefault(); close() }}>
    <header><div><small>工作旅程</small><h2 id="journey-dialog-title">{title}</h2></div><Button variant="ghost" size="icon" className="journey-icon-button" onClick={close} aria-label="关闭"><X size={20}/></Button></header>
    {children}
  </dialog>
}

export function WorkWorthNote({ close }: { close: () => void }) {
  return <JourneyDialog title="给下一步，留一点余地" close={close}>
    <div className="journey-dialog-body"><div className="journey-note-icon"><Coffee size={30}/></div><p>MoneyDance 记录工作时间与收入；WorkWorth 的提议是帮助你规划一段休息需要的生活缓冲金。</p><p>累计工资不等于手头存款。规划休息时，需要由你确认可动用余额、每月支出与计划休息时长。</p><div className="journey-callout">联动尚未接入。这里不会发送你的工资、账本或工作经历。</div></div>
    <footer className="journey-dialog-actions"><Button variant="primary" className="journey-button" onClick={close}>知道了</Button></footer>
  </JourneyDialog>
}

function StageEditor({ editor, profile, close, saved }: { editor: Editor; profile: SalaryProfile; close: () => void; saved: (id: string, ended: boolean) => void }) {
  const today = toLocalDateValue(new Date())
  const initial = editor.stage
  const [newId] = useState(() => crypto.randomUUID())
  const [legacyStage] = useState<WorkStage | null>(() => !profile.workJourney && editor.kind === 'history' ? newWorkStage({ name: '我的当前工作', company: '', role: '', startDate: profile.salaryEffectiveDate, endDate: null, profile: profileSnapshot(profile) }) : null)
  const attaching = editor.kind === 'create' && !profile.workJourney
  const latestEnd = profile.workJourney?.stages.filter(stage => stage.endDate).map(stage => stage.endDate!).sort().at(-1)
  const nextStart = editor.kind === 'create' && latestEnd && latestEnd >= today ? shiftSessionLocalDate(latestEnd, 1) : today
  const [name, setName] = useState(initial?.name ?? (attaching ? '我的当前工作' : ''))
  const [company, setCompany] = useState(initial?.company ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? (attaching ? profile.salaryEffectiveDate : nextStart))
  const [endDate, setEndDate] = useState(initial?.endDate ?? today)
  const [unknown, setUnknown] = useState(initial ? !initial.profile : editor.kind === 'history')
  const [config, setConfig] = useState<SalaryProfile>(() => ({ ...(initial?.profile ?? (attaching ? profileSnapshot(profile) : {
    ...DEFAULT_PROFILE, currency: profile.currency, includeLivingCost: profile.includeLivingCost,
    monthlyLivingCost: profile.monthlyLivingCost, livingCostMode: profile.livingCostMode, livingCostHistory: profile.livingCostHistory,
  })) }))
  const [salary, setSalary] = useState(initial?.profile || attaching ? String(config.salary) : '')
  const [cancelPlans, setCancelPlans] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [advanced, setAdvanced] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const endOnly = editor.kind === 'end'
  const closed = endOnly || editor.kind === 'history' || !!initial?.endDate
  const canOmitProfile = closed && startDate <= today && endDate <= today
  const patch = <K extends keyof SalaryProfile>(key: K, value: SalaryProfile[K]) => setConfig(previous => ({ ...previous, [key]: value }))
  const candidate: WorkStage = initial ? { ...initial, name: name.trim(), company: company.trim(), role: role.trim(), startDate, endDate: closed ? endDate : null } : newWorkStage({ name: name.trim(), company: company.trim(), role: role.trim(), startDate, endDate: closed ? endDate : null, profile: null })
  if (!initial) candidate.id = newId
  candidate.profile = endOnly ? initial?.profile ?? profileSnapshot(profile) : unknown && canOmitProfile ? null : profileSnapshot({
    ...config, salary: salary.trim() ? Number(salary) : Number.NaN,
    salaryEffectiveDate: initial?.profile && initial.profile.salaryEffectiveDate === initial.startDate ? startDate : attaching || initial?.profile ? config.salaryEffectiveDate : startDate,
    salaryHistoryMode: attaching || initial?.profile ? config.salaryHistoryMode : 'custom',
  })
  const stages = [...(profile.workJourney?.stages ?? (legacyStage ? [legacyStage] : [])).filter(stage => stage.id !== initial?.id), candidate]
  const affected = plansOutsideJourney(stages)
  const submit = async () => {
    const validation = validateWorkStage(candidate, stages)
    if (validation) { setError(validation); return }
    if ((endOnly || editor.kind === 'edit') && !preview) { setPreview(true); setError(''); return }
    setBusy(true)
    const result = await commitJourney(profile, stages, cancelPlans)
    setBusy(false)
    if (result) { setError(result); return }
    saved(candidate.id, endOnly && endDate < today)
  }
  const title = endOnly ? '设置最后任职日' : editor.kind === 'edit' ? '修改工作阶段' : editor.kind === 'history' ? '补录过去的工作' : attaching ? '建立当前工作' : '开启一段新工作'
  return <JourneyDialog title={title} close={() => { if (!busy) close() }}>
    <form noValidate onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="journey-dialog-body">
        {preview ? <div className="journey-preview">
          <Flag size={28}/><h3>{candidate.name}</h3><p>{dates(candidate)}</p>
          <dl><div><dt>{closed && endDate > today ? '预计任职日历天数' : '任职日历天数'}</dt><dd>{journeyDateCount(startDate, closed ? endDate : today)} 天</dd></div><div><dt>原日期</dt><dd>{initial ? dates(initial) : '—'}</dd></div><div><dt>生效后的计薪范围</dt><dd>{dates(candidate)}</dd></div></dl>
          <p>按日期归属工作，范围内自动工资会使用该阶段的薪资与排班重新计算。已有出勤、计时和手动收支记录保留；范围外日期停止自动计薪。</p>
          {initial && <div className="journey-callout">涉及 {stageDateImpact(initial, candidate)} 个已有工作或出勤日期的归属变化。手动收支的发生日期保持原样。</div>}
          {!!profile.vacations?.filter(plan => plan.stageId === initial?.id && vacationRange(plan, candidate).clipped).length && <div className="journey-callout">关联假期会保留原日期，仅在新的任职范围内生效。请在阶段概览的「假期安排」检查受影响假期；不会删除已有值班或计时记录。</div>}
          {closed && <div className="journey-callout">{endDate > today && `将于 ${endDate} 结束，到期前仍正常工作与计薪。`}最后任职日当天仍按原规则计薪，跨夜班保留至该班次结束。次日开始休息。</div>}
        </div> : <>
          {attaching && <div className="journey-callout">沿用你已有的薪资设置。请确认入职日期，日期之前的自动工资将不再属于这段工作。</div>}
          {legacyStage && <div className="journey-callout">已有薪资设置会保留为「我的当前工作」，从 {legacyStage.startDate} 开始。补录的过去经历需在此日期之前结束；你也可以先建立当前工作，确认实际入职日期。</div>}
          {!endOnly && <><Input label="阶段名称" required maxLength={60} value={name} onValueChange={setName} placeholder="例如：在山海的三年"/><div className="journey-form-grid"><Input label="公司 · 选填" maxLength={60} value={company} onValueChange={setCompany}/><Input label="岗位 · 选填" maxLength={60} value={role} onValueChange={setRole}/></div></>}
          {endOnly && <p>可以填写已发生或已确定的未来离职日期。到期前继续正常工作，记录与收入会保留。</p>}
          <div className="journey-form-grid journey-date-grid">{!endOnly && <Input label="开始日期" type="date" required min="1900-01-01" value={startDate} onValueChange={setStartDate}/>}{closed && <Input label="最后任职日 · 含当天" type="date" required min={startDate} value={endDate} onValueChange={setEndDate}/>}</div>
          {!endOnly && <>
            {canOmitProfile && <label className="journey-checkbox"><Checkbox checked={unknown} onCheckedChange={setUnknown} ariaLabel={"暂不填写历史薪资与工时"}/>暂不填写历史薪资与工时</label>}
            {unknown && canOmitProfile ? <div className="journey-callout">只保留任职经历，薪资与工时标为「待补充」，不使用当前工资推算。</div> : <>
              <div className="journey-form-grid"><SelectField label="薪资类型" value={config.salaryType} onValueChange={value => patch('salaryType', value as SalaryProfile['salaryType'])}>{Object.entries(salaryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><Input label="薪资金额 · 元" type="number" inputMode="decimal" required min="0" max="999999999" step="0.01" value={salary} onValueChange={setSalary}/></div>
              <div className="journey-form-grid"><SelectField label="工作方式" value={config.defaultWorkMode} onValueChange={value => patch('defaultWorkMode', value as SalaryProfile['defaultWorkMode'])}><option value="scheduled">固定上下班</option><option value="flexible">弹性计时</option></SelectField><SelectField label="每周工作天数" value={config.workDaysPerWeek} onValueChange={value => patch('workDaysPerWeek', Number(value))}>{[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day} 天</option>)}</SelectField></div>
              <div className="journey-form-grid"><Input label="上班时间" type="time" required value={config.workStartTime} onValueChange={value => patch('workStartTime', value)}/><Input label="下班时间" type="time" required value={config.workEndTime} onValueChange={value => patch('workEndTime', value)}/></div>
              <BouncyAccordion className="journey-advanced" value={advanced} onValueChange={setAdvanced} items={[{ id: 'rules', title: '休息时段与更多计薪规则', description: <>
                {getBreakPeriods(config).map((period, index) => <div className="journey-break-row" key={period.id}><Input label={`休息 ${index + 1} 开始`} type="time" required value={period.startTime} onValueChange={value => patch('breakPeriods', getBreakPeriods(config).map((p, i) => i === index ? { ...p, startTime: value } : p))}/><Input label={`休息 ${index + 1} 结束`} type="time" required value={period.endTime} onValueChange={value => patch('breakPeriods', getBreakPeriods(config).map((p, i) => i === index ? { ...p, endTime: value } : p))}/><Button variant="ghost" size="icon" type="button" aria-label={`删除休息 ${index + 1}`} className="journey-icon-button" onClick={() => patch('breakPeriods', getBreakPeriods(config).filter((_, i) => i !== index))}><X size={16}/></Button></div>)}
                <Button variant="secondary" type="button" className="journey-text-button" onClick={() => patch('breakPeriods', [...getBreakPeriods(config), { id: crypto.randomUUID(), name: '休息', startTime: '12:00', endTime: '13:00' }])}>＋ 添加休息时段</Button>
                <label className="journey-checkbox"><Checkbox checked={config.paidBreak} onCheckedChange={value => patch('paidBreak', value)} ariaLabel="休息时间带薪"/>休息时间带薪</label>
                <div className="journey-form-grid"><SelectField label="月薪换算" value={config.monthlyRateBasis} onValueChange={value => patch('monthlyRateBasis', value as SalaryProfile['monthlyRateBasis'])}><option value="actual-calendar">按实际月历</option><option value="average">按平均计薪天数</option></SelectField><Input label="月计薪天数" type="number" inputMode="decimal" min="0.01" max="31" step="0.01" required value={config.monthlyWorkDays} onValueChange={value => patch('monthlyWorkDays', Number(value))}/></div>
                <SelectField label="发薪日 · 选填" value={config.payday ?? ''} onValueChange={value => patch('payday', value ? Number(value) : null)}><option value="">未设置</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i+1}>每月 {i+1} 日</option>)}</SelectField>
                <p className="journey-muted">{attaching || initial ? '保留原有大小周、扣减项和生活费规则。' : '新工作默认固定工作周、无工资扣减项；生活费沿用个人设置。'}当前工作的完整计薪规则可在「我的」中调整。</p>
              </> }]} />
            </>}
          </>}
        </>}
        {affected.length > 0 && <label className="journey-checkbox"><Checkbox checked={cancelPlans} onCheckedChange={setCancelPlans} ariaLabel={`取消工作日期之外的 ${affected.length} 条未来预约`}/>取消工作日期之外的 {affected.length} 条未来预约</label>}
        {error && <p className="journey-error" role="alert">{error}</p>}
      </div>
      <footer className="journey-dialog-actions"><Button variant="secondary" type="button" className="journey-button" disabled={busy} onClick={() => preview ? setPreview(false) : close()}>{preview ? '返回修改' : '取消'}</Button><Button variant="primary" type="submit" className="journey-button" disabled={busy}>{busy ? '正在保存…' : preview ? '确认保存' : endOnly || editor.kind === 'edit' ? '预览影响' : '保存这段工作'}</Button></footer>
    </form>
  </JourneyDialog>
}

export function WorkJourney() {
  const profile = useProfile()
  const now = useNow(60_000)
  const today = toLocalDateValue(now)
  const stages = profile.workJourney?.stages ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorProfile, setEditorProfile] = useState(profile)
  const [tab, setTab] = useState('overview')
  const [page, setPage] = useState(0)
  const [worth, setWorth] = useState(false)
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const selected = stages.find(stage => stage.id === selectedId) ?? stages[0]
  const open = stages.find(stage => stage.endDate === null)
  const active = stages.find(stage => stage.startDate <= today && (!stage.endDate || stage.endDate >= today))
  const rows = useMemo(() => selected ? stageDays(profile, selected, now) : [], [profile, selected, now])
  const income = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  const hours = rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0) / 3600
  const supplemental = selected ? stageSupplementalIncome(selected.id) : []
  const known = !!selected?.profile
  const selectedEnded = !!selected?.endDate && selected.endDate < today
  const selectedRateDate=selectedEnded ? selected!.endDate! : selected && selected.startDate>today ? selected.startDate : today
  const selectedRoster=selected?.profile ? rosterForDate(profile,selectedRateDate) : undefined
  const rates = selected?.profile ? calculateRates(salaryProfileForBusinessDate(profile, selectedRateDate)) : null
  const openEditor = (value: Editor) => { setEditorProfile(profile); setEditor(value) }
  const startNew = () => openEditor(open ? { kind: 'end', stage: open } : { kind: 'create' })
  const choose = (id: string) => { setSelectedId(id); setMobileDetail(true); setTab('overview'); setPage(0) }
  const days = stages.reduce((sum, stage) => sum + journeyElapsedDays(stage, today), 0)
  return <div className={`page journey-page${mobileDetail ? ' journey-show-detail' : ''}`}>
    <header className="journey-heading"><div><p className="journey-eyebrow">MY WORK JOURNEY</p><h1>工作旅程<span>每一段，都算数。</span></h1><p className="journey-muted">把努力留在时间里，也为下一段生活留出空间。</p></div><div className="journey-actions"><Button variant="secondary" className="journey-button" onClick={() => openEditor({ kind: 'history' })}>补录过去</Button><Button variant="primary" className="journey-button" onClick={startNew}><Plus size={16}/>{stages.length ? '开启新工作' : '建立当前工作'}</Button></div></header>
    <section className="journey-hero"><div><span className="journey-hero-label"><Route size={17}/>走过的每一步，都有回响</span><h2>{stages.length ? active ? '认真工作的你，正在积累自己的故事。' : '暂时停下来，也是旅程的一部分。' : '从第一段工作，开始记录你的旅程。'}</h2><p>{stages.length ? '新的开始不会覆盖过去。工作、休息，都有属于自己的位置。' : '已有的工资与计时记录，会按你确认的日期归入工作阶段。'}</p></div><div className="journey-hero-stats"><div><strong>{stages.length}<small> 段</small></strong><span>工作经历</span></div><div><strong>{days.toLocaleString()}<small> 天</small></strong><span>累计任职</span></div></div></section>
    {!stages.length ? <section className="journey-empty"><div className="journey-note-icon"><BriefcaseBusiness size={30}/></div><h2>让这段工作，有一个自己的位置</h2><p>记录从哪天开始、做过什么，以及认真投入的时间。<br/>过去的经历也可以慢慢补齐。</p><Button variant="primary" className="journey-button" onClick={() => openEditor({ kind: 'create' })}><Plus size={17}/>建立当前工作</Button></section> : <div className="journey-layout">
      <aside className="journey-timeline"><div className="journey-section-title"><h2>我的时间线</h2><span>{stages.length} 段工作</span></div>
        {!active && <div className="journey-rest"><Coffee size={20}/><div><b>{open ? '等待新的开始' : '暂时休息'}</b><p>{open ? `${open.startDate} 开始新工作` : stages[0]?.endDate ? `休息第 ${Math.max(1, journeyDateCount(shiftSessionLocalDate(stages[0].endDate, 1), today))} 天` : '按自己的节奏向前'}</p><Button variant="secondary" className="journey-text-button" onClick={() => setWorth(true)}>给下一步留一点余地 <ArrowUpRight size={13}/></Button></div></div>}
        {stages.map((stage, index) => {
          const older = stages[index + 1]
          const gap = older?.endDate ? journeyDateCount(shiftSessionLocalDate(older.endDate, 1), shiftSessionLocalDate(stage.startDate, -1)) : 0
          return <div key={stage.id}><Button variant="secondary" className={`journey-stage${selected?.id === stage.id ? ' selected' : ''}`} onClick={() => choose(stage.id)} aria-pressed={selected?.id === stage.id}><span className="journey-stage-top"><BriefcaseBusiness size={17}/><small>{journeyStageLabel(stage, today)}</small></span><b>{stage.name}</b><span>{stage.company || stage.role || '属于你的一段经历'}</span><time>{dates(stage)}</time>{stageVacationSummary(profile, stage, today) && <span className="journey-vacation-summary">{stageVacationSummary(profile, stage, today)}</span>}<span className="journey-stage-bottom">{journeyElapsedDays(stage, today)} 天 <ChevronRight size={15}/></span></Button>{gap > 0 && <div className="journey-gap"><Coffee size={14}/><span>{older!.endDate! >= today ? '预计休息' : stage.startDate > today ? '本次休息共' : '休息了'} {gap} 天</span></div>}</div>
        })}
        <Button variant="secondary" className="journey-add-history" onClick={() => openEditor({ kind: 'history' })}><Plus size={16}/>补上一段过去的经历</Button>
      </aside>
      {selected && <section className="journey-detail"><Button variant="secondary" className="journey-back journey-text-button" onClick={() => setMobileDetail(false)}><ArrowLeft size={17}/>返回时间线</Button><header><div><span className="journey-pill">{selectedEnded ? '已归档' : journeyStageLabel(selected, today)}</span><h2>{selected.name}</h2><p>{[selected.company, selected.role].filter(Boolean).join(' · ') || '认真走过的日子，都值得被记住。'}</p><time>{dates(selected)}</time></div><Button variant="secondary" className="journey-text-button" onClick={() => openEditor({ kind: 'edit', stage: selected })}>修改信息</Button></header>
        <Tabs className="journey-tabs" value={tab} onValueChange={value => { setTab(value); setPage(0) }}><TabsTrigger value="overview">阶段概览</TabsTrigger><TabsTrigger value="daily">每日明细</TabsTrigger></Tabs>
        <div id="journey-panel" role="tabpanel" aria-label={tab === 'overview' ? '阶段概览' : '每日明细'}>
        {tab === 'overview' ? <>
          <div className="journey-metrics"><div><span>阶段工作收入</span><strong>{known ? money(income) : '待补充'}</strong><small>自动工资、调整与加班</small></div><div><span>已记录工作时间</span><strong>{known ? `${hours.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} h` : '待补充'}</strong><small>按排班或实际计时</small></div></div>
          <div className="journey-config"><div className="journey-section-title"><h3>薪资与时间快照</h3><span>{selectedEnded ? '保留这段工作的规则' : selected.startDate > today ? '保留这段工作的独立规则' : '与当前薪资设置同步'}</span></div>{selected.profile ? <dl><div><dt>{selectedRoster?.pay.mode==='hourly'?'每小时金额':selectedRoster?.pay.mode==='shift'?'班次计薪':salaryLabels[selected.profile.salaryType]}</dt><dd>{selectedRoster?.pay.mode==='hourly'?money(selectedRoster.pay.value):selectedRoster?.pay.mode==='shift'?'按各班次金额':money(selected.profile.salary)}</dd></div><div><dt>{selectedRoster?.pay.mode==='salary'?'自然日日薪':selectedRoster?'当日计划工资':'标准日薪'}</dt><dd>{money(rosterStandardDayAmount(profile,selectedRateDate,rates?.daily??0))}</dd></div><div><dt>工作方式</dt><dd>{selectedRoster ? selectedRoster.mode==='manual'?'手动排班':selectedRoster.mode==='weekly'?'每周循环':`${selectedRoster.cycle.length} 天循环` : selected.profile.defaultWorkMode === 'scheduled' ? '固定上下班' : '弹性计时'}</dd></div><div><dt>工作时间</dt><dd>{selectedRoster ? selectedRoster.templates.map(shift=>`${shift.name} ${shift.startTime}–${shift.endDay?`+${shift.endDay}天 `:''}${shift.endTime}`).join('；') || '按单日安排' : `${selected.profile.workStartTime}–${selected.profile.workEndTime}`}</dd></div><div><dt>工作安排</dt><dd>{selectedRoster ? `${selectedRoster.effectiveFrom} 起生效` : selected.profile.workWeekMode === 'alternating' ? '大小周' : `每周 ${selected.profile.workDaysPerWeek} 天`}</dd></div><div><dt>休息时段</dt><dd>{selectedRoster ? '随各班次的休息时段与计薪设置' : <>{getBreakPeriods(selected.profile).map(period => `${period.startTime}–${period.endTime}`).join('、') || '无'}{selected.profile.paidBreak ? ' · 带薪' : ''}</>}</dd></div></dl> : <p className="journey-muted">历史薪资和工时还没有填写。你可以随时补齐，不会用现在的工资倒推。</p>}</div>
          <div className="journey-vacations"><div className="journey-section-title"><h3>阶段假期</h3><Link className="text-button" to={`/roster?stage=${selected.id}`}>阶段排班</Link><VacationSettingsButton stageId={selected.id}/></div>{(profile.vacations ?? []).filter(plan => plan.stageId === selected.id).map(plan => { const range = vacationRange(plan, selected); return <div className="journey-vacation-record" key={plan.id}><b>{plan.name} · {vacationPayLabel(plan)}</b><small>{plan.startDate} 至 {plan.endDate}</small>{range.clipped && <small>{range.active ? `任职范围内生效：${range.start} 至 ${range.end}` : '任职日期内不生效，保留原假期记录'}</small>}</div> })}<p>假期属于这段工作，保留在职状态；已有值班与计时记录优先。</p></div>
          {!!supplemental.length && <div className="journey-config"><h3>关联补发与奖金 · {money(supplemental.reduce((sum, entry) => sum + entry.amount, 0))}</h3>{supplemental.map(entry => <p className="journey-muted" key={entry.id}>{entry.localDate ?? toLocalDateValue(new Date(entry.occurredAt))} · {entry.source} · {money(entry.amount)}</p>)}<p className="journey-muted">按实际到账日期保留在账本，单独展示，不混入上述自动工作收入。</p></div>}
          <div className="journey-reflection"><Flag size={21}/><div><h3>{selectedEnded ? '这一段努力，已经成为你的底气。' : '每一个认真度过的工作日，都算数。'}</h3><p>{selectedEnded ? '工作结束了，经历和记录会一直留在这里。' : '偶尔休息一下，也别忘了肯定自己的付出。'}</p></div></div>
          <div className="journey-detail-footer"><Link to="/summary">查看完整账本 <ArrowUpRight size={14}/></Link>{!selectedEnded && <Button variant="secondary" className="journey-text-button" onClick={() => openEditor({ kind: 'end', stage: selected })}>{selected.endDate ? '调整最后任职日' : '结束这段工作'}</Button>}</div>
        </> : <><p className="journey-muted journey-table-note">每日工资沿用计薪规则；工时来自排班或已保存的计时。补录未知历史不会生成估算值。</p><div className="journey-table"><table><thead><tr><th>日期</th><th>出勤</th><th>工时</th><th>工作收入</th></tr></thead><tbody>{rows.slice(page * 10, page * 10 + 10).map(row => <tr key={row.date}><td>{row.date}<small className="journey-day-times">{row.times}</small></td><td>{row.label}</td><td>{row.seconds === null ? '待补充' : `${(row.seconds / 3600).toFixed(1)} h`}</td><td>{row.amount === null ? '待补充' : money(row.amount)}</td></tr>)}</tbody></table>{!rows.length && <p className="journey-muted">工作尚未开始，明细将在开始后出现。</p>}</div><div className="journey-pagination"><Button variant="secondary" className="journey-button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 10))}</span><Button variant="secondary" className="journey-button" disabled={(page+1)*10 >= rows.length} onClick={() => setPage(page + 1)}>下一页</Button></div></>}
        </div>
      </section>}
    </div>}
    {editor && <StageEditor editor={editor} profile={editorProfile} close={() => setEditor(null)} saved={(id, ended) => { setEditor(null); setSelectedId(id); setPage(0); if (ended) setCelebrate(id) }}/>}
    {celebrate && <JourneyDialog title="这一程，辛苦了。" close={() => setCelebrate(null)}><div className="journey-dialog-body journey-celebration"><div className="journey-note-icon"><Check size={32}/></div><h3>{stages.find(stage => stage.id === celebrate)?.name}</h3><p>所有认真走过的日子，都已经成为你的故事。<br/>工作记录已归档，你可以按自己的节奏安排下一步。</p></div><footer className="journey-dialog-actions"><Button variant="secondary" className="journey-button" onClick={() => setCelebrate(null)}>看看阶段总结</Button><Button variant="primary" className="journey-button" onClick={() => { setCelebrate(null); startNew() }}>开启新工作</Button></footer></JourneyDialog>}
    {worth && <WorkWorthNote close={() => setWorth(false)}/>}
  </div>
}
