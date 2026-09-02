import {
  calculateMonthlySalaryDeductions,
  calculateRates,
  type AlternatingWeekType,
  type LivingCostMode,
  type MonthlyRateBasis,
  type PaydayAdjustment,
  type SalaryDeduction,
  type SalaryDeductionType,
  type SalaryProfile,
  type SalaryRates,
  type SalaryType,
  type WorkMode,
  type WorkWeekMode,
} from '@salary-flow/core'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { AppUpdateCard } from '../components/AppUpdateCard'
import { alternatingWeekTypeForDate, getWeekStartDateValue } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { ALTERNATING_MONTHLY_WORK_DAYS, loadProfile, recommendedMonthlyWorkDays, salaryProfileForBusinessDate, saveProfile } from '../lib/profile'
import './Settings.css'

function validDeductions(deductions: readonly SalaryDeduction[]): boolean {
  return deductions.every(item => item.id.trim()
    && item.name.trim()
    && Number.isFinite(item.value)
    && item.value >= 0
    && item.value <= MAX_MONEY_AMOUNT
    && (item.type !== 'percentage' || item.value <= 100))
}

function buildProfile(
  profile: SalaryProfile,
  salaryInput: string,
  paydayInput: string,
  monthlyLivingCostInput: string,
  monthlyWorkDaysInput: string,
  workDaysPerWeekInput: string,
): SalaryProfile | null {
  const salary = parseNumberInput(salaryInput)
  const payday = paydayInput.trim() === '' ? null : parseNumberInput(paydayInput)
  const monthlyLivingCost = parseNumberInput(monthlyLivingCostInput)
  const monthlyWorkDays = parseNumberInput(monthlyWorkDaysInput)
  const workDaysPerWeek = parseNumberInput(workDaysPerWeekInput)

  if (
    salary === null || salary < 0 || salary > MAX_MONEY_AMOUNT
    || (paydayInput.trim() !== '' && (payday === null || !Number.isInteger(payday) || payday < 1 || payday > 31))
    || monthlyLivingCost === null || monthlyLivingCost < 0 || monthlyLivingCost > MAX_MONEY_AMOUNT
    || monthlyWorkDays === null || monthlyWorkDays <= 0 || monthlyWorkDays > 31
    || workDaysPerWeek === null || !Number.isInteger(workDaysPerWeek) || workDaysPerWeek < 1 || workDaysPerWeek > 7
    || !validDeductions(profile.salaryDeductions)
  ) return null

  return { ...profile, salary, payday, monthlyLivingCost, monthlyWorkDays, workDaysPerWeek }
}

export function Settings() {
  const [initialProfile] = useState(() => loadProfile())
  const [profile, setProfile] = useState<SalaryProfile>(initialProfile)
  const [salaryInput, setSalaryInput] = useState(String(initialProfile.salary))
  const [paydayInput, setPaydayInput] = useState(initialProfile.payday === null ? '' : String(initialProfile.payday))
  const [monthlyLivingCostInput, setMonthlyLivingCostInput] = useState(String(initialProfile.monthlyLivingCost))
  const [monthlyWorkDaysInput, setMonthlyWorkDaysInput] = useState(String(initialProfile.monthlyWorkDays))
  const [workDaysPerWeekInput, setWorkDaysPerWeekInput] = useState(String(initialProfile.workDaysPerWeek))
  const [salaryEffectiveDateInput, setSalaryEffectiveDateInput] = useState(initialProfile.salaryEffectiveDate || toLocalDateValue())
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const draftProfile = buildProfile(profile, salaryInput, paydayInput, monthlyLivingCostInput, monthlyWorkDaysInput, workDaysPerWeekInput)
  let rates: SalaryRates | null = null
  let rateProfile: SalaryProfile | null = null
  let monthlyDeductions = 0
  let calculationError = ''
  if (draftProfile) {
    try {
      rateProfile = salaryProfileForBusinessDate(draftProfile, toLocalDateValue())
      rates = calculateRates(rateProfile)
      monthlyDeductions = calculateMonthlySalaryDeductions(rateProfile)
    } catch {
      calculationError = '有效计薪时长必须大于 0，请检查上下班时间和午休设置。'
    }
  }

  const set = <K extends keyof SalaryProfile>(key: K, value: SalaryProfile[K]) => {
    setSaved(false)
    setProfile(current => ({ ...current, [key]: value }))
  }

  const updateWorkDaysPerWeek = (value: string) => {
    const normalized = normalizeDecimalInput(value, 0)
    const workDaysPerWeek = parseNumberInput(normalized)
    setSaved(false)
    setWorkDaysPerWeekInput(normalized)
    if (workDaysPerWeek !== null && Number.isInteger(workDaysPerWeek) && workDaysPerWeek >= 1 && workDaysPerWeek <= 7) {
      setMonthlyWorkDaysInput(String(recommendedMonthlyWorkDays(workDaysPerWeek)))
    }
  }

  const selectWorkWeekMode = (mode: WorkWeekMode) => {
    setSaved(false)
    setProfile(current => mode === 'alternating'
      ? { ...current, workWeekMode: mode, alternatingAnchorDate: getWeekStartDateValue(), alternatingAnchorType: 'big' }
      : { ...current, workWeekMode: mode })
    if (mode === 'alternating') {
      setMonthlyWorkDaysInput(String(ALTERNATING_MONTHLY_WORK_DAYS))
      return
    }
    const workDaysPerWeek = parseNumberInput(workDaysPerWeekInput)
    if (workDaysPerWeek !== null && Number.isInteger(workDaysPerWeek) && workDaysPerWeek >= 1 && workDaysPerWeek <= 7) {
      setMonthlyWorkDaysInput(String(recommendedMonthlyWorkDays(workDaysPerWeek)))
    }
  }

  const selectCurrentWeekType = (type: AlternatingWeekType) => {
    setSaved(false)
    setProfile(current => ({
      ...current,
      alternatingAnchorDate: getWeekStartDateValue(),
      alternatingAnchorType: type,
    }))
  }

  const addDeduction = () => {
    setSaved(false)
    setProfile(current => ({
      ...current,
      salaryDeductions: [...current.salaryDeductions, {
        id: createId(),
        name: '社保',
        type: 'fixed',
        value: 0,
        enabled: true,
      }],
    }))
  }

  const updateDeduction = (id: string, patch: Partial<SalaryDeduction>) => {
    setSaved(false)
    setProfile(current => ({
      ...current,
      salaryDeductions: current.salaryDeductions.map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  const removeDeduction = (id: string) => {
    setSaved(false)
    setProfile(current => ({
      ...current,
      salaryDeductions: current.salaryDeductions.filter(item => item.id !== id),
    }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity() || !draftProfile || !rates) return
    const salaryEffectiveDate = draftProfile.salaryHistoryMode === 'custom' ? salaryEffectiveDateInput : toLocalDateValue()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(salaryEffectiveDate) || salaryEffectiveDate > toLocalDateValue()) return
    const savedProfile = saveProfile({ ...draftProfile, salaryEffectiveDate })
    if (!savedProfile) {
      setSaved(false)
      setSaveError('薪资设置暂时无法保存，请释放设备存储空间后重试。')
      return
    }
    setProfile(savedProfile)
    setSaved(true)
    setSaveError('')
  }

  const rateLabelPrefix = profile.includeLivingCost && profile.livingCostMode === 'deduct'
    ? '可支配'
    : monthlyDeductions > 0 ? '预计到手' : ''
  const currentWeekType = alternatingWeekTypeForDate(new Date(), profile)

  return <section className="page">
    <header className="page-header"><div><p className="eyebrow">SALARY PROFILE</p><h1>先定义，你的一小时值多少钱。</h1><p>支持按实际工作日折算，并用工资扣除项估算更接近到手的时间单价。</p></div></header>
    <form className="settings-card" onSubmit={submit}>
      <div className="settings-section">
        <h3>工资</h3>
        <div className="form-grid">
          <label><span>工资金额</span><input required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={salaryInput} onKeyDown={preventInvalidNumberKey} onChange={event => { setSaved(false); setSalaryInput(normalizeDecimalInput(event.target.value)) }}/></label>
          <label><span>工资周期</span><select required value={profile.salaryType} onChange={event => set('salaryType', event.target.value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></select></label>
          <label className="payday-field"><span>每月发薪日</span><input type="number" inputMode="numeric" min="1" max="31" step="1" value={paydayInput} onKeyDown={preventInvalidNumberKey} onChange={event => { setSaved(false); setPaydayInput(normalizeDecimalInput(event.target.value, 0)) }} placeholder="例如：10"/><small>可选 1—31 日；当月没有该日期时，按月末发薪。</small></label>
          {profile.workWeekMode === 'fixed' && <label><span>每周工作日</span><input required type="number" inputMode="numeric" min="1" max="7" step="1" value={workDaysPerWeekInput} onKeyDown={preventInvalidNumberKey} onChange={event => updateWorkDaysPerWeek(event.target.value)}/></label>}
        </div>

        {paydayInput && <fieldset className="work-mode-options payday-adjustment-options"><legend>发薪日遇到非工作日</legend>{([
          ['previous-workday', '提前发放', '提前至上一个工作日，推荐'],
          ['next-workday', '顺延发放', '顺延至下一个工作日'],
          ['none', '保持日期', '不根据工作日调整'],
        ] as [PaydayAdjustment, string, string][]).map(([value, title, description]) => <label key={value}><input type="radio" name="payday-adjustment" checked={profile.paydayAdjustment === value} onChange={() => set('paydayAdjustment', value)}/><span><b>{title}{value === 'previous-workday' && <small>推荐</small>}</b><em>{description}</em></span></label>)}</fieldset>}

        <fieldset className="work-mode-options monthly-rate-options"><legend>月薪折算方式</legend>{([
          ['actual-calendar', '按本月实际日历', '根据工作周、法定节假日和调休自动计算'],
          ['average', '按月平均工作日', '使用固定平均值，时间单价不会每月变化'],
        ] as [MonthlyRateBasis, string, string][]).map(([value, title, description]) => <label key={value}><input type="radio" name="monthly-rate-basis" checked={profile.monthlyRateBasis === value} onChange={() => set('monthlyRateBasis', value)}/><span><b>{title}{value === 'actual-calendar' && <small>推荐</small>}</b><em>{description}</em></span></label>)}</fieldset>
        {profile.monthlyRateBasis === 'average'
          ? <div className="form-grid monthly-average-field"><label><span>月平均工作日</span><input required type="number" inputMode="decimal" min="0.01" max="31" step="0.01" value={monthlyWorkDaysInput} onKeyDown={preventInvalidNumberKey} onChange={event => { setSaved(false); setMonthlyWorkDaysInput(normalizeDecimalInput(event.target.value)) }}/></label></div>
          : <p className="work-mode-hint actual-calendar-hint">本月按 <b>{rateProfile?.monthlyWorkDays ?? '—'}</b> 个计薪日折算；节假日与调休变化会自动更新。</p>}

        <fieldset className="work-week-options"><legend>工作周安排</legend>{([
          ['fixed', '固定工作周', '每周按相同天数上班'],
          ['alternating', '大小周', '大周周六上班，小周周末休息'],
        ] as [WorkWeekMode, string, string][]).map(([mode, title, description]) => <label key={mode}><input type="radio" name="work-week-mode" checked={profile.workWeekMode === mode} onChange={() => selectWorkWeekMode(mode)}/><span><b>{title}{mode === 'fixed' && <small>默认</small>}</b><em>{description}</em></span></label>)}</fieldset>
        {profile.workWeekMode === 'alternating' && <div className="alternating-week-settings"><div><b>告诉我们本周是哪一周</b><small>设置一次后，系统会按周自动交替</small></div><fieldset><legend className="sr-only">本周类型</legend>{(['big', 'small'] as AlternatingWeekType[]).map(type => <label key={type}><input type="radio" name="current-week-type" checked={currentWeekType === type} onChange={() => selectCurrentWeekType(type)}/><span>本周是{type === 'big' ? '大周' : '小周'}</span></label>)}</fieldset></div>}
        <p className="work-week-hint">{profile.monthlyRateBasis === 'actual-calendar' ? '工作周会直接参与每个月的实际计薪日计算。' : profile.workWeekMode === 'alternating' ? '已按大小周推荐月平均工作日 23.83 天，你仍可手动调整。' : '修改每周工作日后，会自动推荐对应的月平均工作日。'}</p>

        <div className="salary-deductions-header"><div><b>每月工资扣除</b><small>社保、公积金、个税或其他扣除，可填写固定金额或工资比例</small></div><button type="button" className="ghost-button" onClick={addDeduction}><Plus size={15}/>添加扣除项</button></div>
        {profile.salaryDeductions.length === 0
          ? <div className="salary-deductions-empty">暂未设置，当前时间单价按未扣除金额计算。</div>
          : <div className="salary-deduction-list">{profile.salaryDeductions.map(item => <div className="salary-deduction-row" key={item.id}>
            <label className="deduction-enabled"><input type="checkbox" checked={item.enabled} onChange={event => updateDeduction(item.id, { enabled: event.target.checked })}/><span className="sr-only">启用{item.name}</span></label>
            <label><span>名称</span><input required maxLength={30} value={item.name} onChange={event => updateDeduction(item.id, { name: event.target.value })}/></label>
            <label><span>方式</span><select value={item.type} onChange={event => updateDeduction(item.id, { type: event.target.value as SalaryDeductionType, value: 0 })}><option value="fixed">固定金额</option><option value="percentage">工资比例</option></select></label>
            <label><span>{item.type === 'percentage' ? '比例' : '每月金额'}</span><div className="money-input deduction-value"><i>{item.type === 'percentage' ? '%' : '¥'}</i><input required type="number" inputMode="decimal" min="0" max={item.type === 'percentage' ? 100 : MAX_MONEY_AMOUNT} step="0.01" value={item.value} onKeyDown={preventInvalidNumberKey} onChange={event => updateDeduction(item.id, { value: Number(normalizeDecimalInput(event.target.value) || 0) })}/></div></label>
            <button type="button" className="icon-button danger" onClick={() => removeDeduction(item.id)} aria-label={`删除${item.name}`}><Trash2 size={16}/></button>
          </div>)}</div>}
        {monthlyDeductions > 0 && <p className="salary-deduction-total">预计每月扣除 <b>¥{monthlyDeductions.toFixed(2)}</b>，以下时间单价已自动扣除。</p>}

        <label className="toggle-row"><input type="checkbox" checked={profile.includeLivingCost} onChange={event => set('includeLivingCost', event.target.checked)}/><span><b>计算生活成本</b><small>开启后，可选择从实时工资中扣除，或按自然日自动记入账本</small></span></label>
        {profile.includeLivingCost && <>
          <div className="form-grid living-cost-field"><label><span>月生活成本</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={monthlyLivingCostInput} onKeyDown={preventInvalidNumberKey} onChange={event => { setSaved(false); setMonthlyLivingCostInput(normalizeDecimalInput(event.target.value)) }} placeholder="例如：5000"/></div></label></div>
          <fieldset className="work-mode-options living-cost-options"><legend>计入方式</legend>{([
            ['deduct', '从实时工资中扣除', '显示扣除工资项和生活成本后的可支配工资'],
            ['daily-ledger', '按自然日记入账本', '按当月天数均摊，每天自动生成一笔生活成本支出'],
          ] as [LivingCostMode, string, string][]).map(([mode, title, description]) => <label key={mode}><input type="radio" name="living-cost-mode" checked={profile.livingCostMode === mode} onChange={() => set('livingCostMode', mode)}/><span><b>{title}{mode === 'deduct' && <small>默认</small>}</b><em>{description}</em></span></label>)}</fieldset>
          {profile.livingCostMode === 'daily-ledger' && <p className="work-mode-hint living-cost-hint">每日金额按“分”精确分摊，周末和节假日也会计入；调整只影响当天及以后，过去明细会保留。</p>}
        </>}
      </div>

      <div className="settings-section salary-history-section"><h3>历史账本</h3><label className="toggle-row salary-history-toggle"><input type="checkbox" checked={profile.salaryHistoryMode !== 'none'} onChange={event => set('salaryHistoryMode', event.target.checked ? 'custom' : 'none')}/><span><b>将这份薪资应用至历史</b><small>开启后，可选择从哪一天开始按这份薪资重新计算历史工作收入</small></span></label>{profile.salaryHistoryMode === 'custom' && <label className="history-date-field"><span>历史开始日期</span><input required type="date" max={toLocalDateValue()} value={salaryEffectiveDateInput} onChange={event => { setSaved(false); setSalaryEffectiveDateInput(event.target.value) }}/><small>从这一天开始重新计算工作收入，更早的日期不受影响。</small></label>}</div>

      <div className="settings-section"><h3>工作时间</h3><fieldset className="work-mode-options"><legend>默认计薪方式</legend>{([
        ['scheduled', '固定作息', '按设置的上下班时间自动计薪，适合大多数用户'],
        ['flexible', '弹性作息', '每天开始工作后计薪，也可以临时切回固定作息'],
      ] as [WorkMode, string, string][]).map(([mode, title, description]) => <label key={mode}><input type="radio" name="default-work-mode" checked={profile.defaultWorkMode === mode} onChange={() => set('defaultWorkMode', mode)}/><span><b>{title}{mode === 'scheduled' && <small>推荐</small>}</b><em>{description}</em></span></label>)}</fieldset><p className="work-mode-hint">这只是每天的默认方式，首页可以随时只调整当天。</p><div className="form-grid"><label><span>上班时间</span><input required type="time" value={profile.workStartTime} onChange={event => set('workStartTime', event.target.value)}/></label><label><span>下班时间</span><input required type="time" value={profile.workEndTime} onChange={event => set('workEndTime', event.target.value)}/></label><label><span>午休开始</span><input required type="time" value={profile.breakStartTime} onChange={event => set('breakStartTime', event.target.value)}/></label><label><span>午休结束</span><input required type="time" value={profile.breakEndTime} onChange={event => set('breakEndTime', event.target.value)}/></label></div><label className="toggle-row"><input type="checkbox" checked={profile.paidBreak} onChange={event => set('paidBreak', event.target.checked)}/><span><b>午休计薪</b><small>{profile.defaultWorkMode === 'flexible' ? '弹性工作可以使用“暂停”排除实际休息时间；这里仍用于计算每日目标工时' : '关闭后，实时工资和摸鱼收益都会自动排除午休'}</small></span></label></div>

      {rates && <div className="rate-preview"><div><small>{rateLabelPrefix}日薪</small><b>¥{rates.daily.toFixed(2)}</b></div><div><small>{rateLabelPrefix}时薪</small><b>¥{rates.hourly.toFixed(2)}</b></div><div><small>{rateLabelPrefix}分钟</small><b>¥{rates.minute.toFixed(3)}</b></div><div><small>{rateLabelPrefix}每秒</small><b>¥{rates.second.toFixed(5)}</b></div></div>}
      {calculationError && <p className="settings-warning" role="alert">{calculationError}</p>}
      {draftProfile && draftProfile.includeLivingCost && draftProfile.livingCostMode === 'deduct' && draftProfile.monthlyLivingCost > draftProfile.salary && draftProfile.salaryType === 'monthly' && <p className="settings-warning">生活成本高于月薪，当前可支配薪资会按 0 计算。</p>}
      {saveError && <p className="settings-warning" role="alert">{saveError}</p>}
      <button className="primary-button" type="submit">{saved ? <><CheckCircle2 size={17}/>已保存</> : '保存薪资设置'}</button>
    </form>
    <AppUpdateCard/>
  </section>
}
