import { useState, type FormEvent } from 'react'
import { calculateRates, DEFAULT_PROFILE, type SalaryProfile, type SalaryType } from '@salary-flow/core'
import { Button, Input, SelectField, Switch } from '../ui/BeuiControls'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, toLocalDateValue } from '../lib/form'
import { recommendedMonthlyWorkDays, salaryProfileForBusinessDate, saveProfile } from '../lib/profile'
import { getWeekStartDateValue } from '../lib/attendance'
import { TEST_BUILD } from '../lib/setup'
import './Usability.css'

export function QuickSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [salary, setSalary] = useState('')
  const [profile, setProfile] = useState<SalaryProfile>(() => ({ ...DEFAULT_PROFILE,
    salaryEffectiveDate: toLocalDateValue(), alternatingAnchorDate: getWeekStartDateValue(),
  }))
  const [error, setError] = useState('')
  const set = <K extends keyof SalaryProfile>(key: K, value: SalaryProfile[K]) => {
    setProfile(current => ({ ...current, [key]: value })); setError('')
  }
  const draft = { ...profile, salary: Number(salary) }
  let rates = null
  try { rates = calculateRates(salaryProfileForBusinessDate(draft, toLocalDateValue())) } catch { /* inline validation below */ }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!salary.trim() || !Number.isFinite(draft.salary) || draft.salary < 0 || draft.salary > MAX_MONEY_AMOUNT) {
      setError('请填写有效的工资金额。'); setStep(0); return
    }
    if (!rates || (profile.breakStartTime === profile.breakEndTime && !profile.paidBreak)) {
      setError('请检查工作和午休时间，计薪时长需要大于 0。'); return
    }
    if (step < 2) { setStep(step + 1); return }
    if (!saveProfile(draft)) { setError('未能保存，请检查设备存储后重试。'); return }
    onComplete()
  }
  return <main className="quick-setup">
    <div className="setup-brand">MoneyDance {TEST_BUILD && <span className="test-build-label">易用性测试版</span>}</div>
    <ol className="setup-steps" aria-label="设置进度">{['填工资', '选作息', '看结果'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <form className="setup-card" onSubmit={submit}>
      <header><p className="eyebrow">{step + 1} / 3</p><h1>{['让时间变成看得见的收入', '你通常怎么上班？', '准备好，看见今天的收入'][step]}</h1><p>{['先填工资，稍后随时可以修改。数据保存在当前设备。', '确认下面的作息，我们会据此估算收入。', '核对一下。发薪日、扣除项和特殊排班，都可以稍后补充。'][step]}</p></header>
      {step === 0 && <div className="setup-fields">
        <SelectField label="工资周期" value={profile.salaryType} onValueChange={value => set('salaryType', value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></SelectField>
        <Input label="工资金额" type="number" inputMode="decimal" required min="0" max={MAX_MONEY_AMOUNT} step="0.01" leftIcon="¥" value={salary} placeholder="填写你的工资" onValueChange={value => { setSalary(normalizeDecimalInput(value)); setError('') }}/>
        <p className="setup-note">想看到到手收入，可以直接填到手金额。当前按你填写的金额估算，不自动扣税；已填到手金额时，请勿再重复添加工资扣除。</p>
      </div>}
      {step === 1 && <div className="setup-fields">
        <SelectField label="上班方式" value={profile.defaultWorkMode} onValueChange={value => set('defaultWorkMode', value as SalaryProfile['defaultWorkMode'])}><option value="scheduled">固定上下班 · 自动计薪</option><option value="flexible">每天自己开始、暂停和结束</option></SelectField>
        <SelectField label="工作周" value={profile.workWeekMode === 'alternating' ? 'alternating' : String(profile.workDaysPerWeek)} onValueChange={value => { setProfile(current => ({ ...current, workWeekMode: value === 'alternating' ? 'alternating' : 'fixed', workDaysPerWeek: value === 'alternating' ? 5 : Number(value), monthlyWorkDays: value === 'alternating' ? 23.83 : recommendedMonthlyWorkDays(Number(value)) })) }}>{[5, 6, 7, 4, 3, 2, 1].map(days => <option key={days} value={days}>{days === 5 ? '双休 · 周一至周五' : days === 6 ? '单休 · 周一至周六' : `每周 ${days} 天 · 从周一开始`}</option>)}<option value="alternating">大小周</option></SelectField>
        {profile.workWeekMode === 'alternating' && <SelectField label="本周安排" value={profile.alternatingAnchorType} onValueChange={value => set('alternatingAnchorType', value as 'big' | 'small')}><option value="big">大周 · 周六上班</option><option value="small">小周 · 周末休息</option></SelectField>}
        <div className="setup-two"><Input label={profile.defaultWorkMode === 'flexible' ? '参考开始时间' : '上班时间'} required type="time" value={profile.workStartTime} onValueChange={value => set('workStartTime', value)}/><Input label={profile.defaultWorkMode === 'flexible' ? '参考结束时间' : '下班时间'} required type="time" value={profile.workEndTime} onValueChange={value => set('workEndTime', value)}/></div>
        <div className="setup-toggle"><Switch checked={!profile.paidBreak} onCheckedChange={value => set('paidBreak', !value)} ariaLabel="午休不计薪"/><span>午休不计薪</span></div>
        {!profile.paidBreak && <div className="setup-two"><Input label="午休开始" required type="time" value={profile.breakStartTime} onValueChange={value => set('breakStartTime', value)}/><Input label="午休结束" required type="time" value={profile.breakEndTime} onValueChange={value => set('breakEndTime', value)}/></div>}
        <p className="setup-note">{profile.defaultWorkMode === 'flexible' ? '参考作息用来计算目标工时；每天由你点击开始，并用暂停排除实际休息。' : '到上班时间自动计薪，无需每天打卡。'}轮班、长班和多段休息可在「我的 → 工作时间」继续设置。</p>
      </div>}
      {step === 2 && rates && <div className="setup-result"><span>预计时薪</span><strong>¥{rates.hourly.toFixed(2)}</strong><p>预计日薪 ¥{rates.daily.toFixed(2)} · 按填写金额估算</p><dl><div><dt>工资</dt><dd>¥{draft.salary.toLocaleString()} / {{ monthly: '月', annual: '年', daily: '天', hourly: '小时' }[draft.salaryType]}</dd></div><div><dt>工作周</dt><dd>{profile.workWeekMode === 'alternating' ? '大小周' : `每周 ${profile.workDaysPerWeek} 天`}</dd></div><div><dt>作息</dt><dd>{profile.workStartTime}—{profile.workEndTime}</dd></div><div><dt>午休</dt><dd>{profile.paidBreak ? '不扣除午休时长' : `${profile.breakStartTime}—${profile.breakEndTime} 不计薪`}</dd></div><div><dt>开始方式</dt><dd>{profile.defaultWorkMode === 'scheduled' ? '按作息自动计薪' : '每天点击开始工作'}</dd></div></dl><p className="setup-note">从今天开始记录，不补算过去的工资。每月折算结果可能随工作日与节假日变化。</p></div>}
      {error && <p role="alert" className="settings-warning">{error}</p>}
      <footer className="setup-actions">{step > 0 && <Button type="button" variant="secondary" onClick={() => { setStep(step - 1); setError('') }}>上一步</Button>}<Button type="submit" size="lg">{step === 2 ? '保存并开始' : '下一步'}</Button></footer>
    </form>
  </main>
}
