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
import { CheckCircle2, CircleDollarSign, Clock3, History, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { AppUpdateCard } from '../components/AppUpdateCard'
import { BouncyAccordion } from '../ui/BouncyAccordion'
import { Button, Checkbox, ChoiceCard, ChoiceGroup, Input, SelectField, Switch } from '../ui/BeuiControls'
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

function initialDeductionValueInputs(deductions: readonly SalaryDeduction[]): Record<string, string> {
  return Object.fromEntries(deductions.map(item => [item.id, item.value === 0 ? '' : String(item.value)]))
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
  const [deductionValueInputs, setDeductionValueInputs] = useState<Record<string, string>>(
    () => initialDeductionValueInputs(initialProfile.salaryDeductions),
  )
  const [salaryEffectiveDateInput, setSalaryEffectiveDateInput] = useState(initialProfile.salaryEffectiveDate || toLocalDateValue())
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [openSection, setOpenSection] = useState<string | null>('salary')

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
    const id = createId()
    setSaved(false)
    setDeductionValueInputs(current => ({ ...current, [id]: '' }))
    setProfile(current => ({
      ...current,
      salaryDeductions: [...current.salaryDeductions, {
        id,
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

  const updateDeductionValue = (id: string, value: string) => {
    const normalized = normalizeDecimalInput(value)
    setDeductionValueInputs(current => ({ ...current, [id]: normalized }))
    updateDeduction(id, { value: normalized === '' ? 0 : Number(normalized) })
  }

  const selectDeductionType = (id: string, type: SalaryDeductionType) => {
    setDeductionValueInputs(current => ({ ...current, [id]: '' }))
    updateDeduction(id, { type, value: 0 })
  }

  const removeDeduction = (id: string) => {
    setSaved(false)
    setDeductionValueInputs(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setProfile(current => ({
      ...current,
      salaryDeductions: current.salaryDeductions.filter(item => item.id !== id),
    }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const firstInvalidInput = form.querySelector<HTMLInputElement>('input:invalid')
    if (firstInvalidInput) {
      const sectionId = firstInvalidInput.closest<HTMLElement>('.settings-section-content')?.id
      const sectionByContentId: Record<string, string> = {
        'salary-profile': 'salary',
        'work-schedule': 'work',
        'salary-deductions': 'deductions',
        'salary-history': 'history',
      }
      setSaved(false)
      setOpenSection(sectionId ? sectionByContentId[sectionId] ?? 'salary' : 'salary')
      window.setTimeout(() => {
        firstInvalidInput.focus()
        firstInvalidInput.reportValidity()
      }, 0)
      return
    }
    if (!draftProfile || !rates) {
      setOpenSection(calculationError ? 'work' : 'salary')
      return
    }
    if (!form.reportValidity()) return
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

  const salarySection = <div className="settings-section-content" id="salary-profile">
    <div className="form-grid">
      <Input label="工资金额" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={salaryInput} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setSalaryInput(normalizeDecimalInput(value)) }}/>
      <SelectField label="工资周期" required value={profile.salaryType} onValueChange={value => set('salaryType', value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></SelectField>
      <Input label="每月发薪日" rootClassName="payday-field" type="number" inputMode="numeric" min="1" max="31" step="1" value={paydayInput} onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setPaydayInput(normalizeDecimalInput(value, 0)) }} placeholder="例如：10" hint="可选 1—31 日；当月没有该日期时，按月末发薪。"/>
      {profile.workWeekMode === 'fixed' && <Input label="每周工作日" required type="number" inputMode="numeric" min="1" max="7" step="1" value={workDaysPerWeekInput} onKeyDown={preventInvalidNumberKey} onValueChange={updateWorkDaysPerWeek}/>}
    </div>

    {paydayInput && <ChoiceGroup className="payday-adjustment-options" legend="发薪日遇到非工作日" value={profile.paydayAdjustment} onValueChange={value => set('paydayAdjustment', value as PaydayAdjustment)}>{([
      ['previous-workday', '提前发放', '提前至上一个工作日，推荐'],
      ['next-workday', '顺延发放', '顺延至下一个工作日'],
      ['none', '保持日期', '不根据工作日调整'],
    ] as [PaydayAdjustment, string, string][]).map(([value, title, description]) => <ChoiceCard key={value} value={value} title={title} description={description} badge={value === 'previous-workday' ? '推荐' : undefined}/>)}</ChoiceGroup>}

    <ChoiceGroup className="monthly-rate-options" legend="月薪折算方式" value={profile.monthlyRateBasis} onValueChange={value => set('monthlyRateBasis', value as MonthlyRateBasis)}>{([
      ['actual-calendar', '按本月实际日历', '根据工作周、法定节假日和调休自动计算'],
      ['average', '按月平均工作日', '使用固定平均值，时间单价不会每月变化'],
    ] as [MonthlyRateBasis, string, string][]).map(([value, title, description]) => <ChoiceCard key={value} value={value} title={title} description={description} badge={value === 'actual-calendar' ? '推荐' : undefined}/>)}</ChoiceGroup>
    {profile.monthlyRateBasis === 'average'
      ? <div className="form-grid monthly-average-field"><Input label="月平均工作日" required type="number" inputMode="decimal" min="0.01" max="31" step="0.01" value={monthlyWorkDaysInput} onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setMonthlyWorkDaysInput(normalizeDecimalInput(value)) }}/></div>
      : <p className="work-mode-hint actual-calendar-hint">本月按 <b>{rateProfile?.monthlyWorkDays ?? '—'}</b> 个计薪日折算；节假日与调休变化会自动更新。</p>}

    <ChoiceGroup className="work-week-options" legend="工作周安排" value={profile.workWeekMode} onValueChange={value => selectWorkWeekMode(value as WorkWeekMode)}>{([
      ['fixed', '固定工作周', '每周按相同天数上班'],
      ['alternating', '大小周', '大周周六上班，小周周末休息'],
    ] as [WorkWeekMode, string, string][]).map(([mode, title, description]) => <ChoiceCard key={mode} value={mode} title={title} description={description} badge={mode === 'fixed' ? '默认' : undefined}/>)}</ChoiceGroup>
    {profile.workWeekMode === 'alternating' && <div className="alternating-week-settings"><div><b>告诉我们本周是哪一周</b><small>设置一次后，系统会按周自动交替</small></div><fieldset><legend className="sr-only">本周类型</legend>{(['big', 'small'] as AlternatingWeekType[]).map(type => <label key={type}><input type="radio" name="current-week-type" checked={currentWeekType === type} onChange={() => selectCurrentWeekType(type)}/><span>本周是{type === 'big' ? '大周' : '小周'}</span></label>)}</fieldset></div>}
    <p className="work-week-hint">{profile.monthlyRateBasis === 'actual-calendar' ? '工作周会直接参与每个月的实际计薪日计算。' : profile.workWeekMode === 'alternating' ? '已按大小周推荐月平均工作日 23.83 天，你仍可手动调整。' : '修改每周工作日后，会自动推荐对应的月平均工作日。'}</p>
  </div>

  const workSection = <div className="settings-section-content" id="work-schedule">
    <ChoiceGroup className="default-work-mode-options" legend="默认计薪方式" value={profile.defaultWorkMode} onValueChange={value => set('defaultWorkMode', value as WorkMode)}>{([
      ['scheduled', '固定作息', '按设置的上下班时间自动计薪，适合大多数用户'],
      ['flexible', '弹性作息', '每天开始工作后计薪，也可以临时切回固定作息'],
    ] as [WorkMode, string, string][]).map(([mode, title, description]) => <ChoiceCard key={mode} value={mode} title={title} description={description} badge={mode === 'scheduled' ? '推荐' : undefined}/>)}</ChoiceGroup>
    <p className="work-mode-hint">这只是每天的默认方式，首页可以随时只调整当天。</p>
    <div className="form-grid work-time-grid">
      <Input label="上班时间" required type="time" value={profile.workStartTime} onValueChange={value => set('workStartTime', value)}/>
      <Input label="下班时间" required type="time" value={profile.workEndTime} onValueChange={value => set('workEndTime', value)}/>
      <Input label="午休开始" required type="time" value={profile.breakStartTime} onValueChange={value => set('breakStartTime', value)}/>
      <Input label="午休结束" required type="time" value={profile.breakEndTime} onValueChange={value => set('breakEndTime', value)}/>
    </div>
    <div className="toggle-row"><Switch checked={profile.paidBreak} onCheckedChange={checked => set('paidBreak', checked)} ariaLabel="午休计薪"/><span><b>午休计薪</b><small>{profile.defaultWorkMode === 'flexible' ? '弹性工作可以使用“暂停”排除实际休息时间；这里仍用于计算每日目标工时' : '关闭后，实时工资和摸鱼收益都会自动排除午休'}</small></span></div>
  </div>

  const deductionsSection = <div className="settings-section-content" id="salary-deductions">
    <div className="salary-deductions-header"><div><b>每月工资扣除</b><small>管理每月固定扣除项</small></div><Button type="button" variant="secondary" size="sm" onClick={addDeduction}><Plus size={15}/>新增</Button></div>
    {profile.salaryDeductions.length === 0
      ? <div className="salary-deductions-empty">暂未设置，当前时间单价按未扣除金额计算。</div>
      : <div className="salary-deduction-list">{profile.salaryDeductions.map(item => {
        const deductionValueInput = deductionValueInputs[item.id] ?? (item.value === 0 ? '' : String(item.value))
        const itemMonthlyDeduction = rateProfile
          ? calculateMonthlySalaryDeductions({ ...rateProfile, salaryDeductions: [item] })
          : 0
        const formattedMonthlyDeduction = deductionValueInput === '' ? '—' : `¥${itemMonthlyDeduction.toFixed(2)}`
        return <article className="salary-deduction-row" data-enabled={item.enabled} key={item.id}>
          <header className="salary-deduction-card-header">
            <Checkbox className="deduction-enabled" checked={item.enabled} onCheckedChange={enabled => updateDeduction(item.id, { enabled })} ariaLabel={`启用${item.name}`}/>
            <div className="salary-deduction-card-identity">
              <Input rootClassName="deduction-name-field" label="扣除项名称" required maxLength={30} value={item.name} placeholder="扣除项名称" onValueChange={value => updateDeduction(item.id, { name: value })}/>
              <small>{item.enabled ? '已启用 · 每月扣除' : '已停用 · 暂不扣除'}</small>
            </div>
            <div className="salary-deduction-card-amount"><strong>{formattedMonthlyDeduction}</strong><span>/ 月</span></div>
            <Button type="button" variant="secondary" size="icon" className="deduction-delete-button" onClick={() => removeDeduction(item.id)} aria-label={`删除${item.name}`} title="删除扣除项"><Trash2 size={16}/></Button>
          </header>
          <div className="salary-deduction-fields">
            <SelectField label="扣除方式" value={item.type} onValueChange={value => selectDeductionType(item.id, value as SalaryDeductionType)}><option value="fixed">固定金额</option><option value="percentage">工资比例</option></SelectField>
            <Input label={item.type === 'percentage' ? '工资比例' : '每月金额'} required type="number" inputMode="decimal" min="0" max={item.type === 'percentage' ? 100 : MAX_MONEY_AMOUNT} step="0.01" value={deductionValueInput} leftIcon={item.type === 'percentage' ? '%' : '¥'} onKeyDown={preventInvalidNumberKey} onValueChange={value => updateDeductionValue(item.id, value)} placeholder={item.type === 'percentage' ? '例如：10' : '例如：500'}/>
          </div>
          <footer className="salary-deduction-card-meta">
            <span className="salary-deduction-status"><i/>{item.enabled ? '已计入到手工资' : '暂不计入到手工资'}</span>
            <span className="salary-deduction-estimate"><small>本月预计扣除</small><strong>{formattedMonthlyDeduction}</strong></span>
          </footer>
        </article>
      })}</div>}
    {monthlyDeductions > 0 && <p className="salary-deduction-total">预计每月扣除 <b>¥{monthlyDeductions.toFixed(2)}</b>，时间单价已自动按到手金额计算。</p>}

    <div className="living-cost-block">
      <div className="toggle-row"><Switch checked={profile.includeLivingCost} onCheckedChange={checked => set('includeLivingCost', checked)} ariaLabel="计算生活成本"/><span><b>计算生活成本</b><small>开启后，可选择从实时工资中扣除，或按自然日自动记入账本</small></span></div>
      {profile.includeLivingCost && <>
        <div className="form-grid living-cost-field"><Input label="月生活成本" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={monthlyLivingCostInput} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setMonthlyLivingCostInput(normalizeDecimalInput(value)) }} placeholder="例如：5000"/></div>
        <ChoiceGroup className="living-cost-options" legend="计入方式" value={profile.livingCostMode} onValueChange={value => set('livingCostMode', value as LivingCostMode)}>{([
          ['deduct', '从实时工资中扣除', '显示扣除工资项和生活成本后的可支配工资'],
          ['daily-ledger', '按自然日记入账本', '按当月天数均摊，每天自动生成一笔生活成本支出'],
        ] as [LivingCostMode, string, string][]).map(([mode, title, description]) => <ChoiceCard key={mode} value={mode} title={title} description={description} badge={mode === 'deduct' ? '默认' : undefined}/>)}</ChoiceGroup>
        {profile.livingCostMode === 'daily-ledger' && <p className="work-mode-hint living-cost-hint">每日金额按“分”精确分摊，周末和节假日也会计入；调整只影响当天及以后，过去明细会保留。</p>}
      </>}
    </div>
  </div>

  const historySection = <div className="settings-section-content salary-history-section" id="salary-history">
    <div className="toggle-row salary-history-toggle"><Switch checked={profile.salaryHistoryMode !== 'none'} onCheckedChange={checked => set('salaryHistoryMode', checked ? 'custom' : 'none')} ariaLabel="将这份薪资应用至历史"/><span><b>将这份薪资应用至历史</b><small>开启后，可选择从哪一天开始按这份薪资重新计算历史工作收入</small></span></div>
    {profile.salaryHistoryMode === 'custom' && <Input rootClassName="history-date-field" label="历史开始日期" required type="date" max={toLocalDateValue()} value={salaryEffectiveDateInput} onValueChange={value => { setSaved(false); setSalaryEffectiveDateInput(value) }} hint="从这一天开始重新计算工作收入，更早的日期不受影响。"/>}
  </div>

  return <section className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">SALARY PROFILE</p><h1>先定义，你的一小时值多少钱。</h1><p>支持按实际工作日折算，并用工资扣除项估算更接近到手的时间单价。</p></div></header>
    <form className="settings-card" noValidate onSubmit={submit}>
      {rates && <section className="settings-rate-overview" aria-label="当前时间单价预览">
        <div className="settings-rate-primary"><span>{rateLabelPrefix || '税前'}预估时薪</span><strong>¥{rates.hourly.toFixed(2)}</strong><small>随下方设置实时更新</small></div>
        <div className="settings-rate-details"><div><small>{rateLabelPrefix}日薪</small><b>¥{rates.daily.toFixed(2)}</b></div><div><small>每分钟</small><b>¥{rates.minute.toFixed(3)}</b></div><div><small>每秒</small><b>¥{rates.second.toFixed(5)}</b></div></div>
      </section>}
      <BouncyAccordion
        className="settings-accordion"
        value={openSection}
        onValueChange={setOpenSection}
        items={[
          { id: 'salary', icon: <CircleDollarSign size={18}/>, title: <><b>工资与发薪</b><small>工资周期、发薪日和折算方式</small></>, description: salarySection },
          { id: 'work', icon: <Clock3 size={18}/>, title: <><b>工作时间</b><small>默认作息、上下班与午休时间</small></>, description: workSection },
          { id: 'deductions', icon: <ReceiptText size={18}/>, title: <><b>扣除与生活成本</b><small>工资扣除项和每月生活支出</small></>, description: deductionsSection },
          { id: 'history', icon: <History size={18}/>, title: <><b>历史账本</b><small>设置薪资生效的历史日期</small></>, description: historySection },
        ]}
      />
      {calculationError && <p className="settings-warning" role="alert">{calculationError}</p>}
      {draftProfile && draftProfile.includeLivingCost && draftProfile.livingCostMode === 'deduct' && draftProfile.monthlyLivingCost > draftProfile.salary && draftProfile.salaryType === 'monthly' && <p className="settings-warning">生活成本高于月薪，当前可支配薪资会按 0 计算。</p>}
      {saveError && <p className="settings-warning" role="alert">{saveError}</p>}
      <Button className="settings-save-button" type="submit" size="lg" ripple>{saved ? <><CheckCircle2 size={17}/>已保存</> : '保存薪资设置'}</Button>
    </form>
    <div className="settings-update-card"><AppUpdateCard/></div>
  </section>
}
