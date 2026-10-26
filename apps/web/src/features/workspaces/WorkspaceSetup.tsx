import { useState, type FormEvent } from 'react'
import { DEFAULT_PROFILE } from '@salary-flow/core'
import { Button, Input, SelectField, Switch } from '../../ui/BeuiControls'
import { MAX_MONEY_AMOUNT, toLocalDateValue } from '../../lib/form'
import { newSpace } from '../../lib/workspaces/store'
import { SPACE_TEMPLATES, templateFeatures, type SpaceTemplate, type WorkSpace } from '../../lib/workspaces/model'
import { TemplateSelector } from './TemplateSelector'

/** Shared by first launch and additional jobs; nothing is written before submit. */
export function WorkspaceSetup({ onSave, onCancel, initial = false }: {
  onSave: (space: WorkSpace) => Promise<void> | void
  onCancel?: () => void
  initial?: boolean
}) {
  const [template, setTemplate] = useState<SpaceTemplate>('fixed')
  const [step, setStep] = useState(1)
  const [name, setName] = useState(initial ? '我的主业' : '')
  const [salary, setSalary] = useState('')
  const [date, setDate] = useState(toLocalDateValue)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')
  const [hasBreak, setHasBreak] = useState(true)
  const [days, setDays] = useState('5')
  const [payday, setPayday] = useState('')
  const [target, setTarget] = useState('')
  const [holidays, setHolidays] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const features = templateFeatures(template)
  const meta = SPACE_TEMPLATES.find(item => item.id === template)!

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    setBusy(true); setError('')
    try {
      if (!salary.trim()) throw new Error('请填写工资金额。')
      const item = newSpace(name, template, Number(salary), date, {
        workStartTime: features.fixedHours || template === 'sales' ? start : DEFAULT_PROFILE.workStartTime,
        workEndTime: features.fixedHours || template === 'sales' ? end : DEFAULT_PROFILE.workEndTime,
        breakPeriods: (features.fixedHours || template === 'sales') && hasBreak ? [{ id: 'lunch', name: '午休', startTime: breakStart, endTime: breakEnd }] : [],
        paidBreak: false, workDaysPerWeek: Number(days), payday: payday.trim() ? Number(payday) : null,
        monthlyIncomeTarget: features.hourly || template === 'sales' ? Number(target) : 0,
      })
      if (features.fixedHours) item.holidaySettings.enabled = holidays
      await onSave(item)
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }

  return <section className="workspace-setup" aria-label="工作场景设置向导">
    <ol className="workspace-steps" aria-label="设置进度"><li aria-current={step === 1 ? 'step' : undefined}>01 选择工作方式</li><li aria-current={step === 2 ? 'step' : undefined}>02 确认计薪规则</li></ol>
    {step === 1 ? <><TemplateSelector value={template} onChange={value => { if (templateFeatures(value).hourly !== features.hourly) setSalary(''); setTemplate(value) }}/><p>按实际工作方式选择。同一种方式也可以建立多个独立空间。</p><div className="workspace-actions"><Button onClick={() => setStep(2)}>继续设置</Button>{onCancel && <Button variant="secondary" onClick={onCancel}>取消</Button>}</div></> :
      <form onSubmit={submit}>
        <header><h2>{meta.name}</h2><p>{features.roster ? '先确认工资，再在班次工作台安排出勤和补贴。' : features.hourly ? '开始、暂停、结束计时，按实际工作小时累计收入。' : template === 'sales' ? '手动记录工作，作息用于折算参考时薪和每日目标；提成单独入账。' : '确认固定作息，工作时自动累计收入。'}</p></header>
        <div className="workspace-fields">
          <Input label="工作空间名称" required maxLength={40} value={name} onValueChange={setName} placeholder="例如：门店工作、周末兼职"/>
          <Input label={features.hourly ? '时薪金额' : template === 'sales' ? '每月基本工资' : '月薪金额'} required type="number" min={0} max={MAX_MONEY_AMOUNT} step="0.01" value={salary} onValueChange={setSalary} placeholder={features.hourly ? '请输入你的时薪' : '请输入你的月薪'} leftIcon="¥"/>
          <Input label="开始记薪日期" required type="date" min="1900-01-01" max={initial ? toLocalDateValue() : undefined} value={date} onValueChange={setDate}/>
          {!features.hourly && <Input label="每月发薪日（可选）" type="number" min={1} max={31} step={1} value={payday} onValueChange={setPayday}/>}
          {(features.hourly || template === 'sales') && <Input label="月收入目标（可选）" type="number" min={0} max={MAX_MONEY_AMOUNT} step="0.01" value={target} onValueChange={setTarget} hint="只用于查看目标进度，不参与工资计算。"/>}
        </div>
        {(features.fixedHours || template === 'sales') && <>
          <div className="workspace-fields">
            <Input label={template === 'sales' ? '目标工时起点' : '上班时间'} required type="time" value={start} onValueChange={setStart}/>
            <Input label={template === 'sales' ? '目标工时终点' : '下班时间'} required type="time" value={end} onValueChange={setEnd}/>
            <SelectField label="每周工作安排" value={days} onValueChange={setDays}>{[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day === 5 ? '周一至周五（双休）' : day === 6 ? '周一至周六（单休）' : `每周 ${day} 天`}</option>)}</SelectField>
          </div>
          <div className="workspace-actions"><Switch checked={hasBreak} onCheckedChange={setHasBreak} ariaLabel="设置不计薪午休"/><span>设置不计薪午休</span></div>
          {hasBreak && <div className="workspace-fields"><Input label="午休开始" required type="time" value={breakStart} onValueChange={setBreakStart}/><Input label="午休结束" required type="time" value={breakEnd} onValueChange={setBreakEnd}/></div>}
        </>}
        {features.fixedHours && <div className="workspace-actions"><Switch checked={holidays} onCheckedChange={setHolidays} ariaLabel="同步中国法定节假日"/><span>同步中国法定节假日与补班</span></div>}
        {features.roster && <p className="workspace-notice">{template === 'factory' ? '按个人班次顺序设置循环，例如“白、白、夜、夜、休、休”。' : '按日安排白班、夜班与休息，支持跨日和每班补贴。'} 创建后进入班次配置；空班表不代表已安排出勤。</p>}
        <p>工资从所选日期开始计算。心愿和公共账本共享；每份工作的计薪规则独立保存。</p>
        {error && <p role="alert">{error}</p>}
        <div className="workspace-actions"><Button disabled={busy} type="submit">{busy ? '正在保存…' : features.roster ? '保存并安排班次' : initial ? '保存并开始使用' : '创建工作空间'}</Button><Button disabled={busy} variant="secondary" onClick={() => setStep(1)}>上一步</Button>{onCancel && <Button disabled={busy} variant="ghost" onClick={onCancel}>取消</Button>}</div>
      </form>}
  </section>
}
