import { TEST_BUILD } from '../lib/buildMode'
import { rosterForDate } from '@salary-flow/core'
import { rosterStandardDayAmount } from '../lib/roster'
import { Link } from 'react-router-dom'
import {
  calculateMonthlySalaryDeductions,
  calculateRates,
  getBreakPeriods,
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
import { CheckCircle2, CircleDollarSign, Clock3, History, Palette, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { AppUpdateCard } from '../components/AppUpdateCard'
import { ThemePaletteGrid } from '../components/ThemePicker'
import { BouncyAccordion } from '../ui/BouncyAccordion'
import { Button, Checkbox, ChoiceCard, ChoiceGroup, Input, SelectField, Switch } from '../ui/BeuiControls'
import { alternatingWeekTypeForDate, getWeekStartDateValue, loadAttendanceRecords } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { ALTERNATING_MONTHLY_WORK_DAYS, loadProfile, recommendedMonthlyWorkDays, salaryProfileForBusinessDate, saveDatedProfile, settingsWorkStage, withDatedWorkSettings, withSettingsStage } from '../lib/profile'
import { plannedIncomeForDate } from '../lib/monthlyStats'
import { getSummaryRange, loadLedger, summarizeLedger } from '../lib/ledger'
import { loadWorkRecords } from '../lib/work'
import { isSessionLocalDate } from '../lib/sessionBusinessDate'
import { MobileDockSettings } from '../components/MobileDockSettings'
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
  const [dockSettingsOpen, setDockSettingsOpen] = useState(false)
  const [initialProfile] = useState(() => loadProfile())
  const [profile, setProfile] = useState<SalaryProfile>(initialProfile)
  const [expectedProfile, setExpectedProfile] = useState(initialProfile)
  const [effectiveFrom, setEffectiveFrom] = useState(() => {
    const start = settingsWorkStage(initialProfile)?.startDate ?? ''
    return start > toLocalDateValue() ? start : toLocalDateValue()
  })
  const [historyConfirmed, setHistoryConfirmed] = useState(false)
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
  const activeRoster=rosterForDate(profile, isSessionLocalDate(effectiveFrom) ? effectiveFrom : toLocalDateValue())
  const changesHistory = effectiveFrom < toLocalDateValue() || salaryEffectiveDateInput !== expectedProfile.salaryEffectiveDate
  const shortensHistory = salaryEffectiveDateInput > expectedProfile.salaryEffectiveDate
  let rates: SalaryRates | null = null
  let rateProfile: SalaryProfile | null = null
  let monthlyDeductions = 0
  let calculationError = ''
  let previewIncome: { before: number; after: number } | null = null
  let previewAccumulatedIncome: { before: number; after: number } | null = null
  if (draftProfile) {
    try {
      // The ledger start belongs to the job snapshot, independently of its
      // dated salary rules. Preview both exactly as a settings save would.
      const preview = withSettingsStage(withDatedWorkSettings(expectedProfile, {
        ...draftProfile,
        salaryEffectiveDate: salaryEffectiveDateInput,
        salaryHistoryMode: salaryEffectiveDateInput < toLocalDateValue() ? 'custom' : 'none',
      }, effectiveFrom))
      rateProfile = salaryProfileForBusinessDate(preview, effectiveFrom)
      rates = calculateRates(rateProfile)
      monthlyDeductions = calculateMonthlySalaryDeductions(rateProfile)
      const month = effectiveFrom.slice(0, 7)
      const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
      const attendance = loadAttendanceRecords()
      previewIncome = { before: 0, after: 0 }
      for (let day = 1; day <= days; day++) {
        const date = `${month}-${String(day).padStart(2, '0')}`
        previewIncome.before += plannedIncomeForDate(expectedProfile, date, attendance)
        previewIncome.after += plannedIncomeForDate(preview, date, attendance)
      }
      const now = new Date()
      const { start, end } = getSummaryRange('month', toLocalDateValue(now).slice(0, 7))
      const ledger = loadLedger()
      const work = loadWorkRecords()
      previewAccumulatedIncome = {
        before: summarizeLedger(expectedProfile, ledger, start, end, now, work, attendance).income,
        after: summarizeLedger(preview, ledger, start, end, now, work, attendance).income,
      }
    } catch (error) {
      calculationError = error instanceof Error ? error.message : '请检查生效日期、上下班时间和休息设置。'
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
    if (getBreakPeriods(profile).some(period => !period.name.trim() || period.startTime === period.endTime)) {
      setSaved(false)
      setOpenSection('work')
      setSaveError('请填写休息名称，且休息开始与结束时间不能相同。')
      return
    }
    if (!draftProfile || !rates) {
      setOpenSection(calculationError ? 'work' : 'salary')
      return
    }
    if (!form.reportValidity()) return
    const salaryEffectiveDate = salaryEffectiveDateInput
    if (!/^\d{4}-\d{2}-\d{2}$/.test(salaryEffectiveDate) || salaryEffectiveDate > toLocalDateValue()) return
    if (changesHistory && !historyConfirmed) { setSaveError('请先确认所选历史日期内的收入会重新计算。'); return }
    const savedProfile = saveDatedProfile(expectedProfile, { ...draftProfile, salaryEffectiveDate, salaryHistoryMode: salaryEffectiveDate < toLocalDateValue() ? 'custom' : 'none' }, effectiveFrom)
    if (!savedProfile) {
      setSaved(false)
      setSaveError('薪资设置未保存。若工作阶段已在其他页面更新，请刷新后重试；也请检查设备存储空间。')
      return
    }
    setExpectedProfile(savedProfile)
    // Keep the submitted draft visible, including a salary scheduled for the future.
    setProfile({ ...draftProfile, workJourney: savedProfile.workJourney, workSettingsHistory: savedProfile.workSettingsHistory })
    setSaved(true)
    setSaveError('')
    setHistoryConfirmed(false)
  }

  const rateLabelPrefix = rateProfile?.includeLivingCost && rateProfile.livingCostMode === 'deduct'
    ? '可支配'
    : monthlyDeductions > 0 ? '预计到手' : ''
  const currentWeekType = alternatingWeekTypeForDate(new Date(), profile)

  const monthlySalary = ['monthly','annual'].includes(profile.salaryType)
  const conversionSettings = <><ChoiceGroup className="monthly-rate-options" legend={monthlySalary ? '工资如何分摊' : '月收入与扣除如何折算'} value={profile.monthlyRateBasis} onValueChange={value => set('monthlyRateBasis', value as MonthlyRateBasis)}>{([
      ['actual-calendar', monthlySalary ? '按月工资分摊' : '按本月计薪日', monthlySalary ? '按本月计薪日分摊；正常整月基本工资与填写的月薪一致' : '按本月安排折算月收入及每月扣除项' ],
      ['average', monthlySalary ? '按固定日单价估算' : '按月平均天数', monthlySalary ? '使用月平均天数折算，账本整月合计可能高于或低于月薪' : '用固定天数折算月收入及每月扣除项，实际工资仍按天或小时计算'],
    ] as [MonthlyRateBasis, string, string][]).map(([value, title, description]) => <ChoiceCard key={value} value={value} title={title} description={description} badge={value === 'actual-calendar' ? '推荐' : undefined}/>)}</ChoiceGroup>
    {profile.monthlyRateBasis === 'average'
      ? <div className="form-grid monthly-average-field"><Input label="月平均工作日" required type="number" inputMode="decimal" min="0.01" max="31" step="0.01" value={monthlyWorkDaysInput} onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setMonthlyWorkDaysInput(normalizeDecimalInput(value)) }}/></div>
      : <p className="work-mode-hint actual-calendar-hint">生效月份按 <b>{rateProfile?.monthlyWorkDays ?? '—'}</b> 个计薪日分摊；扣除、请假与额外收入另行计算。</p>}</>

  const salarySection = <div className="settings-section-content" id="salary-profile">
    <p className="work-mode-hint">{settingsWorkStage(profile) ? '正在调整当前或即将开始工作的薪资；已结束的工作保留原有配置。' : profile.workJourney ? '当前没有在职工作。要恢复计薪，请先开启新工作。' : '换工作或暂时休息时，可以把每段经历分别保存。'} <a href="/journey">前往工作旅程 →</a></p>
    <div className="form-grid">
      <Input label="工资金额" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={salaryInput} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setSalaryInput(normalizeDecimalInput(value)) }}/>
      <SelectField label="工资周期" required value={profile.salaryType} onValueChange={value => set('salaryType', value as SalaryType)}><option value="monthly">月薪</option><option value="annual">年薪</option><option value="daily">日薪</option><option value="hourly">时薪</option></SelectField>
      <Input label="每月发薪日" rootClassName="payday-field" type="number" inputMode="numeric" min="1" max="31" step="1" value={paydayInput} onKeyDown={preventInvalidNumberKey} onValueChange={value => { setSaved(false); setPaydayInput(normalizeDecimalInput(value, 0)) }} placeholder="例如：10" hint="可选 1—31 日；当月没有该日期时，按月末发薪。"/>
    </div>

    {paydayInput && <ChoiceGroup className="payday-adjustment-options" legend="发薪日遇到非工作日" value={profile.paydayAdjustment} onValueChange={value => set('paydayAdjustment', value as PaydayAdjustment)}>{([
      ['previous-workday', '提前发放', '提前至上一个工作日，推荐'],
      ['next-workday', '顺延发放', '顺延至下一个工作日'],
      ['none', '保持日期', '不根据工作日调整'],
    ] as [PaydayAdjustment, string, string][]).map(([value, title, description]) => <ChoiceCard key={value} value={value} title={title} description={description} badge={value === 'previous-workday' ? '推荐' : undefined}/>)}</ChoiceGroup>}

    {!activeRoster && (monthlySalary ? conversionSettings : <details><summary>月收入估算与扣除折算</summary>{conversionSettings}</details>)}

    {activeRoster && <p className="work-mode-hint">{activeRoster.pay.mode === 'salary' ? '当前排班沿用月工资，按自然日分摊基本工资；时薪参考整月排班工时。' : '当前排班按小时或班次计薪，以上工资金额不参与这些日期的排班工资。'} <Link to="/roster">查看排班计薪 →</Link></p>}
  </div>

  const regularWeek = <>

    <ChoiceGroup className="work-week-options" legend="工作周安排" value={profile.workWeekMode} onValueChange={value => selectWorkWeekMode(value as WorkWeekMode)}>{([
      ['fixed', '固定工作周', '每周按相同天数上班'],
      ['alternating', '两周轮换（大小周）', '一周周一至周六，另一周周一至周五'],
    ] as [WorkWeekMode, string, string][]).map(([mode, title, description]) => <ChoiceCard key={mode} value={mode} title={title} description={description} badge={mode === 'fixed' ? '默认' : undefined}/>)}</ChoiceGroup>
    {profile.workWeekMode === 'fixed' && <SelectField label="通常哪几天上班" value={workDaysPerWeekInput} onValueChange={updateWorkDaysPerWeek}>{[1,2,3,4,5,6,7].map(days => <option key={days} value={days}>{days === 1 ? '每周一' : days === 7 ? '每天' : `周一至周${['一','二','三','四','五','六'][days - 1]}`} · {days} 天</option>)}</SelectField>}
    {profile.workWeekMode === 'alternating' && <div className="alternating-week-settings"><div><b>本周（{getWeekStartDateValue()} 起）怎样上班</b><small>下周自动切换另一种安排；节假日和补班按日历处理</small></div><fieldset><legend className="sr-only">本周上班日期</legend>{(['big', 'small'] as AlternatingWeekType[]).map(type => <label key={type}><input type="radio" name="current-week-type" checked={currentWeekType === type} onChange={() => selectCurrentWeekType(type)}/><span>{type === 'big' ? '周一至周六 · 周日休息' : '周一至周五 · 周末休息'}</span></label>)}</fieldset><p className="work-mode-hint">下周：{currentWeekType === 'big' ? '周一至周五上班，周末休息' : '周一至周六上班，周日休息'}</p></div>}
    <p className="work-week-hint">其他上班日期或不固定轮班，可使用排班设置。</p>
  </>

  const workSection = <div className="settings-section-content" id="work-schedule"><Link className="text-button" to="/roster">{activeRoster?'当前使用排班 · 调整规则 →':'轮班或长班？设置排班 →'}</Link>{activeRoster&&<p className="work-mode-hint">排班日期使用班次时间、休息和计薪规则；以下作息在未启用排班的日期生效。</p>}
    <details open={!activeRoster}><summary>{activeRoster ? '查看未使用排班日期的备用作息' : '常规工作周与上下班时间'}</summary>{regularWeek}
    <ChoiceGroup className="default-work-mode-options" legend="每天怎样记录工作" value={profile.defaultWorkMode} onValueChange={value => set('defaultWorkMode', value as WorkMode)}>{([
      ['scheduled', '按安排自动记录', '按上下班时间累计，无需每天开表'],
      ['flexible', '手动开始与结束', '按实际计时累计，可暂停休息'],
    ] as [WorkMode, string, string][]).map(([mode, title, description]) => <ChoiceCard key={mode} value={mode} title={title} description={description} badge={mode === 'scheduled' ? '推荐' : undefined}/>)}</ChoiceGroup>
    <p className="work-mode-hint">这只是每天的默认方式，首页可以随时只调整当天。</p>
    <div className="form-grid work-time-grid">
      <Input label="上班时间" required type="time" value={profile.workStartTime} onValueChange={value => set('workStartTime', value)}/>
      <Input label="下班时间" required type="time" value={profile.workEndTime} onValueChange={value => set('workEndTime', value)}/>
    </div>
    <div className="settings-breaks">
      <div className="salary-deductions-header"><div><b>休息时段</b><small>可添加午休、晚休等多段休息</small></div><Button type="button" variant="secondary" size="sm" onClick={() => set('breakPeriods', [...getBreakPeriods(profile), { id: createId(), name: '休息', startTime: '18:00', endTime: '18:30' }])}><Plus size={15}/>添加休息</Button></div>
      {getBreakPeriods(profile).map((period, index) => <div className="settings-break-row" key={period.id}>
        <Input label={`休息名称 ${index + 1}`} required maxLength={30} value={period.name} onValueChange={value => set('breakPeriods', getBreakPeriods(profile).map((item, i) => i === index ? { ...item, name: value } : item))}/>
        <div className="form-grid"><Input label="开始时间" required type="time" value={period.startTime} onValueChange={value => set('breakPeriods', getBreakPeriods(profile).map((item, i) => i === index ? { ...item, startTime: value } : item))}/><Input label="结束时间" required type="time" value={period.endTime} onValueChange={value => set('breakPeriods', getBreakPeriods(profile).map((item, i) => i === index ? { ...item, endTime: value } : item))}/></div>
        <Button type="button" variant="secondary" size="sm" aria-label={`删除${period.name}`} onClick={() => set('breakPeriods', getBreakPeriods(profile).filter((_, i) => i !== index))}><Trash2 size={14}/>删除</Button>
      </div>)}
      {!getBreakPeriods(profile).length && <p className="work-mode-hint">未设置固定休息时段。</p>}
      <p className="work-mode-hint">结束早于开始表示跨午夜；仅计算与工作时间重合的部分，重叠休息不重复扣除。</p>
    </div>
    <div className="toggle-row"><Switch checked={profile.paidBreak} onCheckedChange={checked => set('paidBreak', checked)} ariaLabel="休息计薪"/><span><b>休息计薪</b><small>{profile.defaultWorkMode === 'flexible' ? '弹性工作使用“暂停”排除实际休息；休息时段用于计算每日目标工时' : '关闭后，实时工资和摸鱼收益自动排除全部休息时段'}</small></span></div></details>
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
      <p className="work-mode-hint">个人生活成本从今天起调整，过去按原设置保留；它不跟随下方工资与作息的生效日期。</p>
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
    <Input rootClassName="history-date-field" label="自动记薪开始日期" required type="date" min="1900-01-01" max={toLocalDateValue()} value={salaryEffectiveDateInput} onValueChange={value => { setSaved(false); setHistoryConfirmed(false); setSalaryEffectiveDateInput(value) }} hint="账本从这天起自动补算工资，每天沿用当时的规则。调薪无需修改这里；手工账目与计时记录保留。"/>
    {!!profile.workSettingsHistory?.length && <div className="settings-rule-history"><b>已保存的工资与作息</b>{profile.workSettingsHistory.filter(item => item.stageId === (settingsWorkStage(profile)?.id ?? null)).map(item => <p key={item.effectiveFrom}>{item.effectiveFrom === '1900-01-01' ? '原有规则' : `${item.effectiveFrom} 起`} · ¥{item.settings.salary} / {({ monthly:'月',annual:'年',daily:'天',hourly:'小时' })[item.settings.salaryType]} · {item.settings.workWeekMode === 'alternating' ? '两周轮换' : `每周 ${item.settings.workDaysPerWeek} 天`}</p>)}</div>}
  </div>

  const appearanceSection = <div className="settings-section-content" id="appearance-theme">
    <ThemePaletteGrid className="settings-theme-picker"/>
  </div>

  return <section className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">PROFILE & APPEARANCE</p><h1>设置工资，确认上班安排。</h1><p>工资与作息按生效日期保存，每段时间沿用当时的规则。</p></div></header>
    <form className="settings-card" noValidate onSubmit={submit}>
      {rates && <section className="settings-rate-overview" aria-label="当前时间单价预览">
        <div className="settings-rate-primary"><span>{rateLabelPrefix || '税前'}参考时薪</span><strong>{activeRoster && rates.hourly === 0 ? '待排班' : `¥${rates.hourly.toFixed(2)}`}</strong><small>{effectiveFrom} 生效当天的折算结果</small></div>
        <div className="settings-rate-details"><div><small>{activeRoster?.pay.mode==='salary'?'自然日日薪':activeRoster?'当日计划工资':`${rateLabelPrefix}日薪`}</small><b>¥{rosterStandardDayAmount(rateProfile??profile,effectiveFrom,rates.daily).toFixed(2)}</b></div><div><small>每分钟</small><b>¥{rates.minute.toFixed(3)}</b></div><div><small>每秒</small><b>¥{rates.second.toFixed(5)}</b></div></div>
      </section>}
      <BouncyAccordion
        className="settings-accordion"
        value={openSection}
        onValueChange={setOpenSection}
        items={[
          { id: 'appearance', icon: <Palette size={18}/>, title: <><b>外观与配色</b><small>经典主题与 11 组双配色</small></>, description: appearanceSection },
          { id: 'salary', icon: <CircleDollarSign size={18}/>, title: <><b>工资与发薪</b><small>¥{salaryInput || '—'} / {({ monthly:'月',annual:'年',daily:'天',hourly:'小时' })[profile.salaryType]}{activeRoster ? ' · 计薪规则见排班' : ''}</small></>, description: salarySection },
          { id: 'work', icon: <Clock3 size={18}/>, title: <><b>上班安排</b><small>{activeRoster ? '正在使用排班' : profile.workWeekMode === 'alternating' ? '两周轮换' : `每周 ${workDaysPerWeekInput} 天`} · {profile.workStartTime}–{profile.workEndTime}</small></>, description: workSection },
          { id: 'deductions', icon: <ReceiptText size={18}/>, title: <><b>扣除与生活成本</b><small>工资扣除项和每月生活支出</small></>, description: deductionsSection },
          { id: 'history', icon: <History size={18}/>, title: <><b>历史账本与规则记录</b><small>自动记薪起点、已保存的工资与作息</small></>, description: historySection },
        ]}
      />
      <section className="settings-change-scope" aria-label="本次修改的生效范围">
        <Input label="本次工资与作息从哪天生效" required type="date" min={settingsWorkStage(profile)?.startDate ?? '1900-01-01'} max={settingsWorkStage(profile)?.endDate ?? undefined} value={effectiveFrom} onValueChange={value => { setEffectiveFrom(value); if (value && value < salaryEffectiveDateInput) setSalaryEffectiveDateInput(value); setHistoryConfirmed(false); setSaved(false) }}/>
        <p>{effectiveFrom} 之前沿用原规则；从这天起使用本次设置，直到下一条已保存规则生效。修改本月计薪日或排班工时，会更新本月的参考日薪、时薪及相关估算。</p>
        {previewAccumulatedIncome && <p aria-label="本月累计收入变化"><b>本月累计收入：¥{previewAccumulatedIncome.before.toFixed(2)} → ¥{previewAccumulatedIncome.after.toFixed(2)}</b><small>按当前记录预览，与首页「本月战绩」的累计收入口径相同。</small></p>}
        {previewIncome && <p><b>{effectiveFrom.slice(0,7)} 按已安排出勤预计基本工资：¥{previewIncome.before.toFixed(2)} → ¥{previewIncome.after.toFixed(2)}</b><small>含已设置扣除与出勤调整，不含加班、手工账目和生活费账本支出；实际收入以记录为准。</small></p>}
        {shortensHistory && <div className="settings-history-impact" role="status"><p><b>你正在缩短自动记薪范围</b><br/>开始日期将从 {expectedProfile.salaryEffectiveDate} 改为 {salaryEffectiveDateInput}。过去部分工资可能不再计入累计，具体变化见上方。只想调薪时，保留原开始日期即可。</p><Button type="button" variant="secondary" onClick={() => { setSalaryEffectiveDateInput(expectedProfile.salaryEffectiveDate); setHistoryConfirmed(false); setSaved(false); setSaveError('') }}>保留原记薪开始日期</Button></div>}
        {changesHistory && <label className="settings-history-confirm"><Checkbox checked={historyConfirmed} onCheckedChange={setHistoryConfirmed} ariaLabel="确认重算所选历史范围"/><span>{shortensHistory ? `我确认将自动记薪开始日期推后到 ${salaryEffectiveDateInput}，并接受上方累计收入变化。` : '我确认重算所选历史范围的收入及关联进度，原始记录保留。'}</span></label>}
      </section>
      {calculationError && <p className="settings-warning" role="alert">{calculationError}</p>}
      {draftProfile && draftProfile.includeLivingCost && draftProfile.livingCostMode === 'deduct' && draftProfile.monthlyLivingCost > draftProfile.salary && draftProfile.salaryType === 'monthly' && <p className="settings-warning">生活成本高于月薪，当前可支配薪资会按 0 计算。</p>}
      {saveError && <p className="settings-warning" role="alert">{saveError}</p>}
      <Button className="settings-save-button" type="submit" size="lg" ripple>{saved ? <><CheckCircle2 size={17}/>已保存</> : '保存薪资设置'}</Button>
    </form>
    <section className="settings-dock-card"><div><h2>移动端底部栏</h2><p>选择并排列四个常用功能，其余功能随时从「全部」进入。</p></div><Button variant="secondary" onClick={() => setDockSettingsOpen(true)}>自定义底部栏</Button></section>
    <MobileDockSettings open={dockSettingsOpen} onOpenChange={setDockSettingsOpen}/>
    {!TEST_BUILD && <div className="settings-update-card"><AppUpdateCard/></div>}
  </section>
}
