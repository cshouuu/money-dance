import { useMemo, useState } from 'react'
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react'
import type { SalaryProfile, VacationPlan } from '@salary-flow/core'
import { useProfile } from '../lib/useProfile'
import { toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { saveVacations, vacationImpact, vacationPayLabel, vacationRange, validateVacation } from '../lib/vacations'
import { Button, Input, SelectField } from '../ui/BeuiControls'
import { BottomSheet } from '../ui/BottomSheet'
import './VacationSettings.css'

const money = (amount: number) => `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
const kindNames = { winter: '寒假', summer: '暑假', custom: '假期' }

function VacationEditor({ initial, profile, close, saved }: { initial: VacationPlan; profile: SalaryProfile; close: () => void; saved: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [value, setValue] = useState(String(initial.payMode === 'ratio' ? initial.value * 100 : initial.value))
  const [error, setError] = useState('')
  const [review, setReview] = useState<{ plans: VacationPlan[]; changed: VacationPlan[]; deleting: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const original = profile.vacations?.find(plan => plan.id === initial.id)
  const impact = useMemo(() => review ? vacationImpact(profile, review.plans, review.changed) : null, [profile, review])
  const patch = <K extends keyof VacationPlan>(key: K, next: VacationPlan[K]) => { setDraft(current => ({ ...current, [key]: next })); setError('') }
  const preview = (deleting = false) => {
    const candidate = { ...draft, name: draft.name.trim(), value: draft.payMode === 'normal' ? 1 : draft.payMode === 'unpaid' ? 0 : value.trim() ? Number(value) / (draft.payMode === 'ratio' ? 100 : 1) : NaN }
    const validation = deleting ? null : validateVacation(candidate, profile)
    if (validation) { setError(validation); return }
    const plans = [...(profile.vacations ?? []).filter(plan => plan.id !== initial.id), ...(deleting ? [] : [candidate])]
    setReview({ plans, changed: [...(original ? [original] : []), ...(deleting ? [] : [candidate])], deleting })
    setError('')
  }
  const commit = async () => {
    if (!review || busy) return
    setBusy(true)
    try {
      const failure = await saveVacations(profile, review.plans)
      if (failure) setError(failure)
      else saved()
    } catch { setError('暂时无法保存，请稍后重试。') } finally { setBusy(false) }
  }
  return <div className="vacation-editor">
    {review && impact ? <>
      <h3>{review.deleting ? '删除假期前确认' : '确认假期安排'}</h3>
      <p>{original && review.deleting ? original.name : draft.name} · {review.deleting && original ? original.startDate : draft.startDate} 至 {review.deleting && original ? original.endDate : draft.endDate}</p>
      <div className="vacation-impact" role="table" aria-label="各月预计收入变化">
        <div role="row"><span role="columnheader">月份</span><span role="columnheader">修改前</span><span role="columnheader">修改后</span></div>
        {impact.rows.map(row => <div role="row" key={row.month}><span role="cell">{row.month}</span><b role="cell">{money(row.before)}</b><b role="cell">{money(row.after)}</b></div>)}
      </div>
      <p className="vacation-note">{impact.historical ? '包含历史日期，保存后将重算相关自动工资。' : '未来收入按当前规则预估。'}保留范围内 {impact.preservedDays} 天已有出勤或计时记录，不删除手工收支。</p>
      <p className="vacation-note">{review.deleting ? '删除后恢复原作息；手工标记的值班、请假和实际计时仍优先。' : '月薪 / 年薪在假期涉及的月份按原计薪日分摊，假期不会缩小分母。单日值班默认不额外发薪，补贴可另记加班收入。'}</p>
    </> : <>
      <div className="vacation-form-grid">
        <SelectField label="假期类型" value={draft.kind} onValueChange={kind => setDraft(current => ({ ...current, kind: kind as VacationPlan['kind'], name: `${current.startDate.slice(0, 4)} 年${kindNames[kind as VacationPlan['kind']]}` }))}>
          <option value="winter">寒假</option><option value="summer">暑假</option><option value="custom">自定义</option>
        </SelectField>
        <SelectField label="所属工作" value={draft.stageId ?? 'current'} onValueChange={stage => patch('stageId', stage === 'current' ? null : stage)}>
          {profile.workJourney ? profile.workJourney.stages.filter(stage => stage.profile).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>) : <option value="current">当前工作</option>}
        </SelectField>
      </div>
      <Input label="假期名称" maxLength={40} value={draft.name} onValueChange={name => patch('name', name)}/>
      <div className="vacation-form-grid">
        <Input label="放假首日 · 含当天" type="date" min="1900-01-01" value={draft.startDate} onValueChange={date => patch('startDate', date)}/>
        <Input label="最后一天 · 含当天" type="date" min={draft.startDate} value={draft.endDate} onValueChange={date => patch('endDate', date)}/>
      </div>
      <SelectField label="假期工资" value={draft.payMode} onValueChange={mode => { patch('payMode', mode as VacationPlan['payMode']); setValue(mode === 'ratio' ? '80' : '') }}>
        <option value="normal">工资照常</option><option value="ratio">按比例发放</option><option value="monthly">指定假期月薪</option><option value="unpaid">不计薪</option>
      </SelectField>
      {(draft.payMode === 'ratio' || draft.payMode === 'monthly') && <Input label={draft.payMode === 'ratio' ? '发放比例（%）' : '假期月薪（元，沿用工资扣除设置）'} type="number" min={0} max={draft.payMode === 'ratio' ? 100 : 999999999} step="0.01" value={value} onValueChange={setValue}/>}
      <p className="vacation-note">结束后自动恢复原作息。临时值班、培训或返校，可以在日历中单独调整当天；不会自动增加加班费。</p>
      {original && <Button variant="ghost" size="sm" onClick={() => preview(true)}><Trash2 size={15}/>删除这段假期</Button>}
    </>}
    {error && <p role="alert" className="vacation-error">{error}</p>}
    <div className="vacation-actions"><Button variant="secondary" disabled={busy} onClick={() => review ? setReview(null) : close()}>{review ? '返回修改' : '返回列表'}</Button><Button disabled={busy} onClick={() => review ? void commit() : preview()}>{busy ? '保存中…' : review ? review.deleting ? '确认删除' : '确认保存' : '预览影响'}</Button></div>
  </div>
}

function VacationList({ stageId }: { stageId?: string }) {
  const profile = useProfile()
  const [editor, setEditor] = useState<{ plan: VacationPlan; profile: SalaryProfile } | null>(null)
  const [notice, setNotice] = useState('')
  const today = toLocalDateValue()
  const available = profile.workJourney?.stages.filter(stage => stage.profile) ?? []
  const plans = (profile.vacations ?? []).filter(plan => !stageId || plan.stageId === stageId).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const create = (copy?: VacationPlan) => {
    const stage = available.find(item => item.id === stageId) ?? available.find(item => item.startDate <= today && (!item.endDate || item.endDate >= today)) ?? available[0]
    const start = stage?.startDate && stage.startDate > today ? stage.startDate : stage?.endDate && stage.endDate < today ? stage.endDate : today
    setEditor({ profile, plan: copy ? { ...copy, id: createId(), name: `${copy.name.slice(0, 36)}（副本）` } : { id: createId(), stageId: stage?.id ?? null, kind: 'winter', name: `${start.slice(0, 4)} 年寒假`, startDate: start, endDate: start, payMode: 'normal', value: 1 } })
    setNotice('')
  }
  if (editor) return <VacationEditor initial={editor.plan} profile={editor.profile} close={() => setEditor(null)} saved={() => { setEditor(null); setNotice('假期安排已更新') }}/>
  return <div className="vacation-list">
    <Button onClick={() => create()} disabled={!!profile.workJourney && available.length === 0}><Plus size={17}/>添加假期</Button>
    {notice && <p role="status" className="vacation-note">{notice}</p>}
    {!plans.length && <p className="vacation-note">还没有假期安排。按教师实际放假日期添加寒假、暑假或其他集中休假。</p>}
    {profile.workJourney && available.length === 0 && <p className="vacation-note">先在工作旅程中建立工作并填写薪资，即可关联假期。</p>}
    {plans.map(plan => {
      const stage = profile.workJourney?.stages.find(item => item.id === plan.stageId)
      const range = vacationRange(plan, stage)
      const detached = !!profile.workJourney && !stage
      return <article key={plan.id} className="vacation-list-item"><div><h3>{plan.name}</h3><p>{plan.startDate} 至 {plan.endDate}</p><small>{stage?.name ?? '当前工作'} · {vacationPayLabel(plan)}</small>{(range.clipped || detached) && <p className="vacation-note">{!range.active || detached ? '当前任职范围内不生效，保留原安排。' : `任职范围调整后，仅 ${range.start} 至 ${range.end} 生效。`}</p>}</div><div className="vacation-item-actions"><Button size="sm" variant="secondary" onClick={() => { setEditor({ plan, profile }); setNotice('') }}>查看 / 修改</Button><Button size="sm" variant="ghost" onClick={() => create(plan)} aria-label={`复制${plan.name}`}><Copy size={15}/>复制</Button></div></article>
    })}
  </div>
}

export function VacationSettings({ open, onOpenChange, stageId }: { open: boolean; onOpenChange: (open: boolean) => void; stageId?: string }) {
  return <BottomSheet open={open} onOpenChange={onOpenChange} title="假期安排" description="寒暑假期间仍保持在职，出勤与工资分别安排。" className="vacation-sheet">{open && <VacationList stageId={stageId}/>}</BottomSheet>
}

export function VacationSettingsButton({ stageId }: { stageId?: string }) {
  const [open, setOpen] = useState(false)
  const profile = useProfile()
  const unavailable = !!stageId && !profile.workJourney?.stages.find(stage => stage.id === stageId)?.profile
  return <><Button variant="secondary" disabled={unavailable} title={unavailable ? '先补充这段工作的薪资，再安排假期' : undefined} onClick={() => setOpen(true)}><CalendarDays size={16}/>假期安排</Button><VacationSettings open={open} onOpenChange={setOpen} stageId={stageId}/></>
}
