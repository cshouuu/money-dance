import { calculateRates, type SalaryProfile, type SalaryRates, type SalaryType } from '@salary-flow/core'
import { CheckCircle2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { AppUpdateCard } from '../components/AppUpdateCard'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey } from '../lib/form'
import { loadProfile, saveProfile } from '../lib/profile'
import './Settings.css'

function buildProfile(
  profile: SalaryProfile,
  salaryInput: string,
  monthlyLivingCostInput: string,
  monthlyWorkDaysInput: string,
  workDaysPerWeekInput: string,
): SalaryProfile | null {
  const salary = parseNumberInput(salaryInput)
  const monthlyLivingCost = parseNumberInput(monthlyLivingCostInput)
  const monthlyWorkDays = parseNumberInput(monthlyWorkDaysInput)
  const workDaysPerWeek = parseNumberInput(workDaysPerWeekInput)

  if (
    salary === null || salary < 0 || salary > MAX_MONEY_AMOUNT ||
    monthlyLivingCost === null || monthlyLivingCost < 0 || monthlyLivingCost > MAX_MONEY_AMOUNT ||
    monthlyWorkDays === null || monthlyWorkDays <= 0 || monthlyWorkDays > 31 ||
    workDaysPerWeek === null || !Number.isInteger(workDaysPerWeek) || workDaysPerWeek < 1 || workDaysPerWeek > 7
  ) return null

  return { ...profile, salary, monthlyLivingCost, monthlyWorkDays, workDaysPerWeek }
}

export function Settings() {
  const [initialProfile] = useState(() => loadProfile())
  const [profile, setProfile] = useState<SalaryProfile>(initialProfile)
  const [salaryInput, setSalaryInput] = useState(String(initialProfile.salary))
  const [monthlyLivingCostInput, setMonthlyLivingCostInput] = useState(String(initialProfile.monthlyLivingCost))
  const [monthlyWorkDaysInput, setMonthlyWorkDaysInput] = useState(String(initialProfile.monthlyWorkDays))
  const [workDaysPerWeekInput, setWorkDaysPerWeekInput] = useState(String(initialProfile.workDaysPerWeek))
  const [saved, setSaved] = useState(false)

  const draftProfile = buildProfile(profile, salaryInput, monthlyLivingCostInput, monthlyWorkDaysInput, workDaysPerWeekInput)
  let rates: SalaryRates | null = null
  let calculationError = ''
  if (draftProfile) {
    try {
      rates = calculateRates(draftProfile)
    } catch {
      calculationError = '有效计薪时长必须大于 0，请检查上下班时间和午休设置。'
    }
  }

  const set = <K extends keyof SalaryProfile>(key: K, value: SalaryProfile[K]) => {
    setSaved(false)
    setProfile(current => ({ ...current, [key]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity() || !draftProfile || !rates) return
    saveProfile(draftProfile)
    setProfile(draftProfile)
    setSaved(true)
  }

  const rateLabelPrefix = profile.includeLivingCost ? '可支配' : ''
  return <section className="page"><header className="page-header"><div><p className="eyebrow">SALARY PROFILE</p><h1>先定义，你的一小时值多少钱。</h1><p>这里输入的是“用于时间价值计算的工资”，MVP 不负责个税、社保或不同国家税制。</p></div></header>
    <form className="settings-card" onSubmit={submit}><div className="settings-section"><h3>工资</h3><div className="form-grid"><label><span>工资金额</span><input required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={salaryInput} onKeyDown={preventInvalidNumberKey} onChange={event=>{setSaved(false);setSalaryInput(normalizeDecimalInput(event.target.value))}}/></label><label><span>工资周期</span><select required value={profile.salaryType} onChange={event=>set('salaryType',event.target.value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></select></label><label><span>月平均工作日</span><input required type="number" inputMode="decimal" min="0.01" max="31" step="0.01" value={monthlyWorkDaysInput} onKeyDown={preventInvalidNumberKey} onChange={event=>{setSaved(false);setMonthlyWorkDaysInput(normalizeDecimalInput(event.target.value))}}/></label><label><span>每周工作日</span><input required type="number" inputMode="numeric" min="1" max="7" step="1" value={workDaysPerWeekInput} onKeyDown={preventInvalidNumberKey} onChange={event=>{setSaved(false);setWorkDaysPerWeekInput(normalizeDecimalInput(event.target.value,0))}}/></label></div><label className="toggle-row"><input type="checkbox" checked={profile.includeLivingCost} onChange={event=>set('includeLivingCost',event.target.checked)}/><span><b>计算生活成本</b><small>开启后，会先扣除月生活成本，再计算你的可支配日薪、时薪、分钟薪资和秒薪</small></span></label>{profile.includeLivingCost&&<div className="form-grid living-cost-field"><label><span>月生活成本</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={monthlyLivingCostInput} onKeyDown={preventInvalidNumberKey} onChange={event=>{setSaved(false);setMonthlyLivingCostInput(normalizeDecimalInput(event.target.value))}} placeholder="例如：5000"/></div></label></div>}</div>
      <div className="settings-section"><h3>工作时间</h3><div className="form-grid"><label><span>上班时间</span><input required type="time" value={profile.workStartTime} onChange={event=>set('workStartTime',event.target.value)}/></label><label><span>下班时间</span><input required type="time" value={profile.workEndTime} onChange={event=>set('workEndTime',event.target.value)}/></label><label><span>午休开始</span><input required type="time" value={profile.breakStartTime} onChange={event=>set('breakStartTime',event.target.value)}/></label><label><span>午休结束</span><input required type="time" value={profile.breakEndTime} onChange={event=>set('breakEndTime',event.target.value)}/></label></div><label className="toggle-row"><input type="checkbox" checked={profile.paidBreak} onChange={event=>set('paidBreak',event.target.checked)}/><span><b>午休计薪</b><small>开启后，午休时间也会计入今日实时收入</small></span></label></div>
      {rates&&<div className="rate-preview"><div><small>{rateLabelPrefix}日薪</small><b>¥{rates.daily.toFixed(2)}</b></div><div><small>{rateLabelPrefix}时薪</small><b>¥{rates.hourly.toFixed(2)}</b></div><div><small>{rateLabelPrefix}分钟</small><b>¥{rates.minute.toFixed(3)}</b></div><div><small>{rateLabelPrefix}每秒</small><b>¥{rates.second.toFixed(5)}</b></div></div>}
      {calculationError&&<p className="settings-warning" role="alert">{calculationError}</p>}
      {draftProfile&&draftProfile.includeLivingCost&&draftProfile.monthlyLivingCost>draftProfile.salary&&draftProfile.salaryType==='monthly'&&<p className="settings-warning">生活成本高于月薪，当前可支配薪资会按 0 计算。</p>}
      <button className="primary-button" type="submit">{saved?<><CheckCircle2 size={17}/>已保存</>: '保存薪资设置'}</button></form>
    <AppUpdateCard/>
  </section>
}
