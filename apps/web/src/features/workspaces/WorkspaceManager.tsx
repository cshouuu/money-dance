import { WorkspaceIncome } from './WorkspaceIncome'
import { WorkspaceSetup } from './WorkspaceSetup'
import { TemplateSelector } from './TemplateSelector'
import { applyWorkTemplate } from '../../lib/workspaces/templates'
import { templateFeatures } from '../../lib/workspaces/model'
import { archiveSpace } from '../../lib/workspaces/actions'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { workProfileForDate, type SalaryProfile } from '@salary-flow/core'
import { Button, Input, SelectField, Switch } from '../../ui/BeuiControls'
import { toLocalDateValue } from '../../lib/form'
import { PRIMARY_SPACE_ID, SPACE_TEMPLATES, type WorkSpace, type WorkspaceStore } from '../../lib/workspaces/model'
import { commitWorkspaces, loadWorkspaceStore, replaceSpace, reviseSpace } from '../../lib/workspaces/store'
import { useWorkspaces } from './useWorkspaces'
import { WorkspaceWorkCard } from './WorkspaceOverview'
import { RosterEditor } from '../../pages/Roster'
import { validateRoster } from '../../lib/rosterStorage'
import { profileFingerprint } from '../../lib/profile'
import './Workspaces.css'

export function WorkspaceManager() {
  const spaces = useWorkspaces()
  const [search, setSearch] = useSearchParams()
  const selected = search.get('space')
  const space = spaces.find(item => item.id === selected)
  const [creating, setCreating] = useState(false)
  const create = async (item: WorkSpace) => {
    await commitWorkspaces(loadWorkspaceStore(), store => ({ ...store, spaces: [...store.spaces, item] }))
    setCreating(false)
    setSearch({ space: item.id, ...(templateFeatures(item.template).roster ? { tab: 'roster' } : {}) })
  }
  return <section className="page workspace-page"><header className="page-header"><div><p className="eyebrow">WORK SPACES</p><h1>工作空间</h1><p>一份工作，一个空间。计薪与作息独立，生活和积累在一起。</p></div><Button onClick={() => { setCreating(true); setSearch({}) }}>新增空间</Button></header>
    <nav className="workspace-switch" aria-label="工作空间">{spaces.map(item => <Button key={item.id} variant={selected === item.id ? 'primary' : 'secondary'} onClick={() => { setSearch({ space: item.id }); setCreating(false) }}>{item.name}{item.archivedOn ? ' · 已归档' : ''}</Button>)}</nav>
    {creating && <article className="workspace-panel"><WorkspaceSetup onSave={create} onCancel={() => setCreating(false)}/></article>}
    {!creating && !space && <div className="workspace-grid">{spaces.map(item => <WorkspaceWorkCard key={item.id} space={item}/>)}</div>}
    {!creating && space && <WorkspaceIncome space={space}/> }
    {!creating && space && (space.id === PRIMARY_SPACE_ID ? <article className="workspace-panel"><h2>{space.name}</h2><p>原有工资、出勤、排班与工作经历保留在这个空间。</p><div className="workspace-actions"><Link to="/settings">计薪与作息</Link>{templateFeatures(space.template).roster && <Link to="/roster">排班设置</Link>}<Link to="/attendance">薪苦日历</Link><Link to="/journey">工作旅程</Link></div></article> : <WorkspaceEditor key={space.id} space={space}/>) }
  </section>
}

function WorkspaceEditor({ space }: { space: WorkSpace }) {
  const [expected, setExpected] = useState(loadWorkspaceStore)
  const initialDate = () => { const start = space.profile.workJourney?.stages.at(-1)?.startDate ?? ''; return start > toLocalDateValue() ? start : toLocalDateValue() }
  const [draft, setDraft] = useState(() => workProfileForDate(space.profile, initialDate()))
  const [effective, setEffective] = useState(initialDate)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pay'
  const setTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next) }
  const [selectingTemplate, setSelectingTemplate] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const template = draft.workTemplate ?? space.template
  const features = templateFeatures(template)
  const patch = (next: Partial<SalaryProfile>) => { setDraft(value => ({ ...value, ...next })); setNotice('') }
  const save = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const original = expected.spaces.find(item => item.id === space.id)!
      const next = reviseSpace(original, draft, effective)
      await commitWorkspaces(expected, store => replaceSpace(store, next))
      setExpected(loadWorkspaceStore()); setDraft({ ...next.profile, ...draft, rosters: next.profile.rosters, workSettingsHistory: next.profile.workSettingsHistory }); setNotice(`已保存「${space.name}」，${effective} 起生效。`)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const rosterAdapter = {
    workRecords: space.workRecords, attendanceRecords: space.attendanceRecords, ledger: space.ledger, holidaySettings: space.holidaySettings,
    save: async (profile: SalaryProfile, plans: NonNullable<SalaryProfile['rosters']>) => {
      try {
        const current = loadWorkspaceStore()
        const original = current.spaces.find(item => item.id === space.id)!
        if (profileFingerprint(profile) !== profileFingerprint(original.profile)) return '该空间配置已更新，请重新打开排班。'
        const next = { ...original.profile, rosters: plans }
        for (const plan of plans) { const error = validateRoster(plan, next); if (error) return error }
        await commitWorkspaces(current, store => replaceSpace(store, { ...original, profile: next }))
        setExpected(loadWorkspaceStore()); setDraft(value => ({ ...value, rosters: plans })); return null
      } catch (reason) { return (reason as Error).message }
    },
  }
  return <><WorkspaceWorkCard space={space}/><div className="workspace-actions"><Button variant={tab === 'pay' ? 'primary' : 'secondary'} onClick={() => setTab('pay')}>计薪与作息</Button>{features.roster && <Button variant={tab === 'roster' ? 'primary' : 'secondary'} onClick={() => setTab('roster')}>班次与排班</Button>}</div>
    {tab === 'roster' && features.roster ? <RosterEditor profile={space.profile} stageId={space.profile.workJourney?.stages.at(-1)?.id ?? null} adapter={rosterAdapter}/> : <article className="workspace-panel"><h2>{space.name} · {SPACE_TEMPLATES.find(item => item.id === template)?.name}</h2>
      <Button variant="secondary" disabled={!!space.archivedOn} onClick={() => setSelectingTemplate(value => !value)}>更换工作方式</Button>
      {selectingTemplate && <TemplateSelector value={template} onChange={value => { const next = applyWorkTemplate(draft, value, effective); if (next.salaryType !== draft.salaryType) next.salary = NaN; patch(next); setSelectingTemplate(false); setTab('pay') }}/>}<div className="workspace-fields"><Input label="工资金额（元）" type="number" min={0} value={Number.isFinite(draft.salary) ? String(draft.salary) : ''} onValueChange={value => patch({ salary: value.trim() ? Number(value) : NaN })}/>{!features.hourly && <SelectField label="计薪方式" value={draft.salaryType} onValueChange={value => patch({ salaryType: value as SalaryProfile['salaryType'] })}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option>{!features.roster && <option value="hourly">时薪</option>}</SelectField>}{(features.hourly || template === 'sales') && <Input label="月收入目标（元，可选）" type="number" min={0} value={draft.monthlyIncomeTarget ? String(draft.monthlyIncomeTarget) : ''} onValueChange={value => patch({ monthlyIncomeTarget: value.trim() ? Number(value) : 0 })}/>}<Input label="规则生效日期" type="date" value={effective} onValueChange={setEffective}/>{!features.hourly && <Input label="每月发薪日（留空不设置）" type="number" min={1} max={31} value={draft.payday === null ? '' : String(draft.payday)} onValueChange={value => patch({ payday: value ? Number(value) : null })}/>}{!features.roster && !features.hourly && <SelectField label="出勤方式" value={draft.defaultWorkMode} onValueChange={value => patch({ defaultWorkMode: value as SalaryProfile['defaultWorkMode'] })}><option value="scheduled">按作息自动计薪</option><option value="flexible">记录实际工作时长</option></SelectField>}{!features.roster && !features.hourly && <><Input label="上班时间" type="time" value={draft.workStartTime} onValueChange={value => patch({ workStartTime: value })}/><Input label="下班时间" type="time" value={draft.workEndTime} onValueChange={value => patch({ workEndTime: value })}/><SelectField label="每周工作日" value={String(draft.workDaysPerWeek)} onValueChange={value => patch({ workDaysPerWeek: Number(value), monthlyWorkDays: Number((Number(value) * 52 / 12).toFixed(2)) })}>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>{value} 天</option>)}</SelectField></>}</div><p>修改仅影响本空间生效日期之后的自动计薪。结束工作按实际工时结算；公共心愿清单不会复制。</p><div className="workspace-actions"><Button disabled={busy || !!space.archivedOn} onClick={save}>保存本空间规则</Button></div>{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
      {features.fixedHours && <HolidayRule space={space} expected={expected} onSaved={() => setExpected(loadWorkspaceStore())}/>}
      {features.roster && <p>班次时间、休息和补贴统一在「班次与排班」中设置。保存工作方式后再配置班表。</p>}
      {features.hourly && <p>按实际计时小时结算，无固定出勤要求；项目定金和尾款可记入该空间的收支。</p>}
      <div className="workspace-rule-history"><h3>已保存的规则</h3>{space.profile.workSettingsHistory?.filter(item => item.effectiveFrom !== '1900-01-01').map(item => <p key={item.effectiveFrom}>{item.effectiveFrom} 起 · {SPACE_TEMPLATES.find(meta => meta.id === item.settings.workTemplate)?.name ?? '原有工作方式'} · ¥{item.settings.salary}</p>)}</div>
      <SpaceLifecycle space={space}/>
    </article>}
  </>
}

function HolidayRule({ space, expected, onSaved }: { space: WorkSpace; expected: WorkspaceStore; onSaved: () => void }) {
  const [error, setError] = useState('')
  return <div className="workspace-actions"><Switch ariaLabel="本空间使用法定节假日" checked={space.holidaySettings.enabled} onCheckedChange={async enabled => {
    try { await commitWorkspaces(expected, store => {
      const current = store.spaces.find(item => item.id === space.id)!
      return replaceSpace(store, { ...current, holidaySettings: { ...current.holidaySettings, enabled } })
    }); onSaved(); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }}/><span>本空间使用法定节假日</span>{error && <p role="alert">{error}</p>}</div>
}

function SpaceLifecycle({ space }: { space: WorkSpace }) {
  const [endDate, setEndDate] = useState(toLocalDateValue)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  return <section><h3>空间状态</h3>{space.archivedOn ? <p>最后任职日 {space.archivedOn}。历史收入和记录继续保留在公共模块。</p> : <><Button variant="secondary" onClick={() => setEditing(value => !value)}>结束这份工作</Button>{editing && <><Input label="最后任职日" type="date" value={endDate} onValueChange={setEndDate}/><p>确认后，这个日期以后的自动工资停止计算，原有历史收入和公共记录保留。</p><Button onClick={async () => { try { const current = loadWorkspaceStore(); const original = current.spaces.find(item => item.id === space.id)!; await commitWorkspaces(current, store => replaceSpace(store, archiveSpace(original, endDate))); setEditing(false); setError('') } catch (reason) { setError((reason as Error).message) } }}>确认结束并归档</Button></>}</>}{error && <p role="alert">{error}</p>}</section>
}
