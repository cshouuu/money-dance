import { calculateRates, type SalaryProfile, type SalaryType } from '@salary-flow/core'
import { CheckCircle2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { AppUpdateCard } from '../components/AppUpdateCard'
import { loadProfile, saveProfile } from '../lib/profile'
import './Settings.css'

export function Settings() {
  const [profile,setProfile]=useState<SalaryProfile>(()=>loadProfile()); const [saved,setSaved]=useState(false)
  let rates; try{rates=calculateRates(profile)}catch{rates=null}
  const set=<K extends keyof SalaryProfile>(key:K,value:SalaryProfile[K])=>{setSaved(false);setProfile(p=>({...p,[key]:value}))}
  const submit=(e:FormEvent)=>{e.preventDefault();if(!rates)return;saveProfile(profile);setSaved(true)}
  const rateLabelPrefix = profile.includeLivingCost ? '可支配' : ''
  return <section className="page"><header className="page-header"><div><p className="eyebrow">SALARY PROFILE</p><h1>先定义，你的一小时值多少钱。</h1><p>这里输入的是“用于时间价值计算的工资”，MVP 不负责个税、社保或不同国家税制。</p></div></header>
    <form className="settings-card" onSubmit={submit}><div className="settings-section"><h3>工资</h3><div className="form-grid"><label><span>工资金额</span><input type="number" min="0" step="0.01" value={profile.salary} onChange={e=>set('salary',Number(e.target.value))}/></label><label><span>工资周期</span><select value={profile.salaryType} onChange={e=>set('salaryType',e.target.value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></select></label><label><span>月平均工作日</span><input type="number" min="1" max="31" step="0.01" value={profile.monthlyWorkDays} onChange={e=>set('monthlyWorkDays',Number(e.target.value))}/></label><label><span>每周工作日</span><input type="number" min="1" max="7" value={profile.workDaysPerWeek} onChange={e=>set('workDaysPerWeek',Number(e.target.value))}/></label></div><label className="toggle-row"><input type="checkbox" checked={profile.includeLivingCost} onChange={e=>set('includeLivingCost',e.target.checked)}/><span><b>计算生活成本</b><small>开启后，会先扣除月生活成本，再计算你的可支配日薪、时薪、分钟薪资和秒薪</small></span></label>{profile.includeLivingCost&&<div className="form-grid living-cost-field"><label><span>月生活成本</span><div className="money-input"><i>¥</i><input type="number" min="0" step="0.01" value={profile.monthlyLivingCost} onChange={e=>set('monthlyLivingCost',Number(e.target.value))} placeholder="例如：5000"/></div></label></div>}</div>
      <div className="settings-section"><h3>工作时间</h3><div className="form-grid"><label><span>上班时间</span><input type="time" value={profile.workStartTime} onChange={e=>set('workStartTime',e.target.value)}/></label><label><span>下班时间</span><input type="time" value={profile.workEndTime} onChange={e=>set('workEndTime',e.target.value)}/></label><label><span>午休开始</span><input type="time" value={profile.breakStartTime} onChange={e=>set('breakStartTime',e.target.value)}/></label><label><span>午休结束</span><input type="time" value={profile.breakEndTime} onChange={e=>set('breakEndTime',e.target.value)}/></label></div><label className="toggle-row"><input type="checkbox" checked={profile.paidBreak} onChange={e=>set('paidBreak',e.target.checked)}/><span><b>午休计薪</b><small>开启后，午休时间也会计入今日实时收入</small></span></label></div>
      {rates&&<div className="rate-preview"><div><small>{rateLabelPrefix}日薪</small><b>¥{rates.daily.toFixed(2)}</b></div><div><small>{rateLabelPrefix}时薪</small><b>¥{rates.hourly.toFixed(2)}</b></div><div><small>{rateLabelPrefix}分钟</small><b>¥{rates.minute.toFixed(3)}</b></div><div><small>{rateLabelPrefix}每秒</small><b>¥{rates.second.toFixed(5)}</b></div></div>}
      {profile.includeLivingCost&&profile.monthlyLivingCost>profile.salary&&profile.salaryType==='monthly'&&<p className="settings-warning">生活成本高于月薪，当前可支配薪资会按 0 计算。</p>}
      <button className="primary-button" type="submit">{saved?<><CheckCircle2 size={17}/>已保存</>: '保存薪资设置'}</button></form>
    <AppUpdateCard/>
  </section>
}
