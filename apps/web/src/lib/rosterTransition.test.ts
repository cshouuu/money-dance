import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, type RosterPlan, type SalaryProfile } from '@salary-flow/core'
import { saveChinaHolidaySettings } from './attendance'
import { getSummaryRange, summarizeLedger } from './ledger'
import { plannedIncomeForDate, getMonthlyWorkStats } from './monthlyStats'
import { profileSnapshot } from './workJourney'
import { salaryProfileForBusinessDate } from './profile'
import { rosterStandardDayAmount } from './roster'

const now = new Date(2026, 8, 30, 23)
const base: SalaryProfile = { ...DEFAULT_PROFILE, salary:4000, salaryEffectiveDate:'2026-08-01', salaryHistoryMode:'custom' }
const plan: RosterPlan = { id:'r',stageId:null,effectiveFrom:'2026-09-14',enabled:true,mode:'manual',anchorDate:'2026-09-14',templates:[],cycle:[[]],overrides:[],respectVacations:true,respectHolidays:false,pay:{mode:'salary',value:0,basis:'planned',monthlyHours:0,overtime:'manual',overtimeValue:0,preserveMonthlySalary:true} }
const income = (profile: SalaryProfile, month='2026-09') => {
  const { start,end } = getSummaryRange('month',month)
  return summarizeLedger(profile,[],start,end,now,[],[]).income
}
beforeEach(()=>{
  const data = new Map<string,string>()
  vi.stubGlobal('localStorage',{ getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value) })
  vi.stubGlobal('window',new EventTarget())
  saveChinaHolidaySettings({enabled:false,effectiveFrom:'2026-01-01',dataVersion:''})
})
afterEach(()=>vi.unstubAllGlobals())

it.each([false,true])('keeps 4000 monthly salary through a midmonth switch, holiday calendar=%s', enabled=>{
  saveChinaHolidaySettings({enabled,effectiveFrom:'2026-01-01',dataVersion:''})
  const next={...base,rosters:[plan]}
  expect(income(next)).toBeCloseTo(4000)
  expect(income(next,'2026-08')).toBeCloseTo(income(base,'2026-08'))
  expect(plannedIncomeForDate(next,'2026-09-10',[])).toBeCloseTo(plannedIncomeForDate(base,'2026-09-10',[]))
  expect(getMonthlyWorkStats(next,[],[],[],now).expectedIncome).toBeCloseTo(4000)
})
it('preserves prorated employment and deductions when a stage starts midmonth',()=>{
  const configured={...base,salaryDeductions:[{id:'d',name:'扣除',type:'fixed' as const,value:500,enabled:true}]}
  const stage={id:'job',name:'工作',company:'',role:'',startDate:'2026-09-10',endDate:null,profile:profileSnapshot(configured),createdAt:now.toISOString()}
  const before={...configured,workJourney:{version:1 as const,revision:1,stages:[stage]}}
  const next={...before,rosters:[{...plan,stageId:'job'}]}
  expect(income(next)).toBeCloseTo(income(before))
})
it('keeps monthly salary when returning to regular work during the same month',()=>{
  const next={...base,rosters:[plan,{...plan,id:'off',effectiveFrom:'2026-09-21',enabled:false}]}
  expect(income(next)).toBeCloseTo(4000)
})
it('retains natural-day proration for a job that begins directly with rosters',()=>{
  const stage={id:'job',name:'工作',company:'',role:'',startDate:'2026-09-14',endDate:null,profile:profileSnapshot(base),createdAt:now.toISOString()}
  expect(income({...base,workJourney:{version:1,revision:1,stages:[stage]},rosters:[{...plan,stageId:'job'}]})).toBeCloseTo(4000*17/30)
})
it('uses the same base share for preview, daily adjustments and the ledger',()=>{
  const next={...base,rosters:[plan]}
  const dated=salaryProfileForBusinessDate(next,'2026-09-14',[])
  expect(rosterStandardDayAmount(dated,'2026-09-14',0)).toBeCloseTo(plannedIncomeForDate(next,'2026-09-14',[]))
  expect(dated.calculationHours?.monthlyAmount).toBeCloseTo(4000 - 9 * 4000 / 22)
})
it('does not silently migrate an existing plan or change the saved average estimator',()=>{
  const legacy={...base,rosters:[{...plan,pay:{...plan.pay,preserveMonthlySalary:undefined}}]}
  expect(income(legacy)).toBeCloseTo(9*4000/22+17*4000/30)
  const average={...base,monthlyRateBasis:'average' as const}
  expect(income({...average,rosters:[plan]})).toBeCloseTo(income(average))
})
