import { getRestCountdown } from './restCountdown'
import { commitJourney, profileSnapshot } from './workJourney'
import { DEFAULT_PROFILE, calculateRates, rosterForDate, rosterShiftsForDate, vacationForDate, type RosterPlan, type SalaryProfile, type ShiftTemplate } from '@salary-flow/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actualPaidIntervalsInRange, calculatePaidTimeEarnings, estimatePaidEarningsCompletionDate } from './paidTime'
import { intervalSeconds, rosterPayForDate, rosterDayLabel, shiftIntervals, shiftDuration } from './roster'
import { validateRoster, saveRosterPlans } from './rosterStorage'
import { getScheduledBusinessDate, summarizeTodayWork } from './work'
import { getMonthlyWorkStats } from './monthlyStats'
import { summarizeLedger } from './ledger'
import { salaryProfileForBusinessDate, loadProfile, saveProfile } from './profile'
import { resolveAttendanceDay, saveChinaHolidaySettings } from './attendance'
import { buildWidgetSnapshot } from './widgetState'
import { keys, saveJSON } from './storage'
import type { AttendanceRecord, DailyWorkRecord } from '../types'

const shift:ShiftTemplate={id:'long',name:'长班',color:'primary',startTime:'09:00',endTime:'21:00',endDay:1,breaks:[{id:'rest',name:'午休',startMinute:180,endMinute:240,paid:false}],amount:700,allowance:50}
const plan:RosterPlan={id:'rule',stageId:null,effectiveFrom:'2026-08-01',enabled:true,mode:'cycle',anchorDate:'2026-08-03',templates:[shift],cycle:[['long'],[],[],[]],overrides:[],respectVacations:true,respectHolidays:false,pay:{mode:'shift',value:20,basis:'planned',monthlyHours:0,overtime:'unpaid',overtimeValue:0}}
const profile:SalaryProfile={...DEFAULT_PROFILE,salary:8400,salaryEffectiveDate:'2026-01-01',rosters:[plan]}
const at=(value:string)=>new Date(`2026-${value}:00`)
const settings={enabled:false,effectiveFrom:'2026-01-01',dataVersion:''}
beforeEach(()=>{const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{});saveChinaHolidaySettings(settings)})

afterEach(()=>vi.unstubAllGlobals())

describe('roster and long shifts',()=>{
 it('represents 24 and 36 hour shifts with explicit paid and unpaid breaks',()=>{
  expect(shiftDuration(shift)).toBe(36*3600)
  expect(intervalSeconds(shiftIntervals(shift,'2026-08-03'))).toBe(35*3600)
  expect(shiftDuration({...shift,endTime:'09:00'})).toBe(24*3600)
  const paid={...shift,breaks:shift.breaks.map(item=>({...item,paid:true}))}
  expect(intervalSeconds(shiftIntervals(paid,'2026-08-03'))).toBe(36*3600)
 })
 it('supports arbitrary cycles without moving phase after a one-day override',()=>{
  const overridden={...profile,rosters:[{...plan,overrides:[{date:'2026-08-03',shifts:[],reason:'调休'}]}]}
  expect(rosterShiftsForDate(overridden,'2026-08-03')).toEqual([])
  expect(rosterShiftsForDate(overridden,'2026-08-07')).toEqual([shift])
  expect(validateRoster(overridden.rosters[0],overridden)).toBeNull()
 })
 it('validates overlap across cycle seams, templates and rule versions',()=>{
  const bad={...plan,cycle:[['long']]};expect(validateRoster(bad,{...profile,rosters:[bad]})).toContain('重叠')
  const badRest={...shift,breaks:[...shift.breaks,{id:'bad',name:'重复',startMinute:200,endMinute:260,paid:false}]}
  expect(validateRoster({...plan,templates:[badRest]},profile)).toContain('休息')
  const next={...plan,id:'next',effectiveFrom:'2026-08-04',anchorDate:'2026-08-04'}
  expect(validateRoster(next,{...profile,rosters:[plan,next]})).toContain('重叠')
 })
 it('supports weekly and manual schedules and multiple nonoverlapping shifts per date',()=>{
  const a={...shift,id:'a',endDay:0,endTime:'12:00',breaks:[]};const b={...a,id:'b',startTime:'14:00',endTime:'18:00'}
  const weekly={...plan,mode:'weekly' as const,templates:[a,b],cycle:[['a','b'],[],[],[],[],[],[]]}
  const configured={...profile,rosters:[weekly]}
  expect(rosterShiftsForDate(configured,'2026-08-03')).toHaveLength(2)
  expect(validateRoster(weekly,configured)).toBeNull()
  expect(rosterShiftsForDate({...profile,rosters:[{...weekly,mode:'manual'}]},'2026-08-03')).toEqual([])
 })
 it('keeps long shifts on their start date and labels continued days',()=>{
  expect(getScheduledBusinessDate(profile,at('08-04T20:00'))).toBe('2026-08-03')
  expect(rosterDayLabel(profile,'2026-08-04')).toContain('续')
  expect(summarizeTodayWork(profile,[],at('08-04T20:00'))).toMatchObject({businessDate:'2026-08-03',workedSeconds:34*3600,earnedAmount:0,rosterName:'长班'})
  expect(rosterPayForDate(profile,'2026-08-03',at('08-04T21:00'))).toBe(750)
 })
 it('counts cross-month work in the month it occurs without duplicating per-shift pay',()=>{
  const one={...plan,mode:'manual' as const,overrides:[{date:'2026-08-31',shifts:[shift],reason:''}]}
  const configured={...profile,rosters:[one]}
  const stats=getMonthlyWorkStats(configured,[],[],[],at('09-01T23:00'))
  expect(stats.totalWorkedSeconds).toBe(21*3600)
  expect(stats.plannedSeconds).toBe(21*3600)
  const august=summarizeLedger(configured,[],at('08-01T00:00'),at('09-01T00:00'),at('09-01T23:00'),[],[])
  expect(august.income).toBe(750)
  const september=summarizeLedger(configured,[],at('09-01T00:00'),at('10-01T00:00'),at('09-01T23:00'),[],[])
  expect(september.income).toBe(0)
 })
 it('keeps a fixed monthly salary with no planned hours',()=>{
  const configured={...profile,rosters:[{...plan,mode:'manual' as const,pay:{...plan.pay,mode:'salary' as const}}]}
  const stats=getMonthlyWorkStats(configured,[],[],[],at('08-31T23:00'))
  expect(stats.income).toBeCloseTo(8400)
  expect(stats.expectedIncome).toBeCloseTo(8400)
  expect(stats.totalWorkedSeconds).toBe(0)
  expect(stats.averageHourlyIncome).toBeNull()
  expect(calculateRates(salaryProfileForBusinessDate(configured,'2026-08-03')).second).toBe(0)
 })
 it('uses explicit hourly price and preserves unpaid rest in slacking and wishes',()=>{
  const configured={...profile,rosters:[{...plan,pay:{...plan.pay,mode:'hourly' as const}}]}
  const earnings=calculatePaidTimeEarnings(configured,at('08-03T11:00'),at('08-03T14:00'),[],[],settings)
  expect(earnings).toMatchObject({paidSeconds:7200,earnedAmount:40})
  expect(estimatePaidEarningsCompletionDate(configured,at('08-03T11:00'),40,[],settings)).toEqual(at('08-03T14:00'))
  expect(rosterPayForDate(configured,'2026-08-03',at('08-04T21:00'))).toBe(750)
 })
 it('honors vacation policies and explicit holiday duty',()=>{
  const vacation={id:'vac',stageId:null,name:'暑假',kind:'summer' as const,startDate:'2026-08-01',endDate:'2026-08-31',payMode:'normal' as const,value:1}
  const configured={...profile,vacations:[vacation]}
  expect(resolveAttendanceDay(at('08-03T09:00'),configured,undefined,settings).isWorkday).toBe(false)
  const duty={...configured,rosters:[{...plan,overrides:[{date:'2026-08-03',shifts:[shift],reason:'值班'}]}]}
  expect(vacationForDate(duty,'2026-08-03')).toBeUndefined()
  expect(resolveAttendanceDay(at('08-03T09:00'),duty,undefined,settings).isWorkday).toBe(true)
 })
 it('uses actual sessions for hourly corrections and explicit final daily amounts',()=>{
  const record:DailyWorkRecord={date:'2026-08-03',mode:'flexible',status:'ended',sessions:[{id:'s',startTime:at('08-03T09:00').toISOString(),endTime:at('08-03T14:00').toISOString()}],updatedAt:at('08-03T14:00').toISOString()}
  const configured={...profile,rosters:[{...plan,pay:{...plan.pay,mode:'hourly' as const,basis:'actual' as const}}]}
  expect(rosterPayForDate(configured,record.date,at('08-03T15:00'),[record])).toBe(80)
  expect(summarizeTodayWork(configured,[record],at('08-03T15:00')).workedSeconds).toBe(4*3600)
  const fixed={...profile,rosters:[{...plan,overrides:[{date:record.date,shifts:[shift],amount:100,reason:'半班'}]}]}
  expect(rosterPayForDate(fixed,record.date,at('08-03T15:00'),[record])).toBe(100)
 })
 it('preserves history when adding a new effective version and disabling future rosters',()=>{
  const next={...plan,id:'next',effectiveFrom:'2026-08-10',enabled:false}
  const configured={...profile,rosters:[plan,next]}
  expect(rosterForDate(configured,'2026-08-03')?.id).toBe(plan.id)
  expect(rosterForDate(configured,'2026-08-10')).toBeUndefined()
 })
 it('syncs exact long-shift slices to the widget across midnight',()=>{
  const now=at('08-04T01:00');const finish=at('08-04T03:00')
  const snapshot=buildWidgetSnapshot({profile,workRecords:[],attendanceRecords:[],now,horizonMs:+finish-+now})
  expect(snapshot.paidWorkTimeline?.reduce((sum,item)=>sum+(item.endAt-item.startAt)/1000,0)).toBe(7200)
  expect(intervalSeconds(actualPaidIntervalsInRange(profile,now,finish))).toBe(7200)
 })
 it('rejects stale settings and preserves storage on write failure',async()=>{
  saveJSON(keys.profile,{...profile,rosters:undefined});const original=loadProfile()
  expect(await saveRosterPlans(original,[plan])).toBeNull()
  expect(saveProfile(original)).toBeNull()
  expect(await saveRosterPlans(original,[])).toContain('更新')
  const current=loadProfile();vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full')})
  expect(await saveRosterPlans(current,[...current.rosters!,{...plan,id:'next',effectiveFrom:'2026-09-01',enabled:false}])).toContain('保存失败')
  expect(loadProfile().rosters).toEqual([plan])
 })
 it('does not change legacy months when rosters start later or are disabled',()=>{
  const legacy={...profile,rosters:undefined}
  const baseline=getMonthlyWorkStats(legacy,[],[],[],at('08-31T23:00'))
  for(const future of [{...plan,effectiveFrom:'2026-09-01'}, {...plan,enabled:false}]) {
    const stats=getMonthlyWorkStats({...legacy,rosters:[future]},[],[],[],at('08-31T23:00'))
    expect(stats.expectedIncome).toBeCloseTo(baseline.expectedIncome)
    expect(stats.income).toBeCloseTo(baseline.income)
    expect(stats.plannedSeconds).toBe(baseline.plannedSeconds)
  }
 })
 it('uses only the salaried roster portion of a partial month to derive hourly value',()=>{
  const salaried={...plan,effectiveFrom:'2026-08-03',pay:{...plan.pay,mode:'salary' as const}}
  const configured={...profile,rosters:[salaried]}
  const rates=calculateRates(salaryProfileForBusinessDate(configured,'2026-08-03'))
  // Eight 35-hour shifts, with the last shift contributing only 14 August hours.
  expect(rates.second*3600).toBeCloseTo((8400*29/31)/(7*35+14))
  const job={id:'job',name:'工作',company:'',role:'',createdAt:at('08-01T00:00').toISOString(),startDate:'2026-08-03',endDate:'2026-08-08',profile:profileSnapshot(profile)}
  const staged={...profile,workJourney:{version:1 as const,revision:1,stages:[job]},rosters:[{...salaried,stageId:'job'}]}
  expect(calculateRates(salaryProfileForBusinessDate(staged,'2026-08-03')).second*3600).toBeCloseTo((8400*6/31)/70)
 })
 it('uses the natural-day salary for manual attendance and the final roster amount consistently',()=>{
  const configured={...profile,rosters:[{...plan,pay:{...plan.pay,mode:'salary' as const}}]}
  const attendance:AttendanceRecord={date:'2026-08-03',status:'normal',payMode:'multiplier',multiplier:2,updatedAt:at('08-03T09:00').toISOString()}
  expect(summarizeTodayWork(configured,[],at('08-03T11:00'),undefined,[attendance]).earnedAmount).toBeCloseTo(8400/31*2)
  const final={...configured,rosters:[{...configured.rosters[0],overrides:[{date:attendance.date,shifts:[shift],amount:123,reason:''}]}]}
  const off:AttendanceRecord={...attendance,status:'holiday',payMode:'unpaid'}
  expect(summarizeTodayWork(final,[],at('08-03T11:00'),undefined,[off]).earnedAmount).toBe(123)
  expect(summarizeLedger(final,[],at('08-03T00:00'),at('08-04T00:00'),at('08-03T23:00'),[],[off]).income).toBe(123)
 })
 it('settles automatic extra hours once and respects unpaid, multiplier and fixed policies',()=>{
  const short={...shift,endDay:0,endTime:'18:00',allowance:0}
  const record:DailyWorkRecord={date:'2026-08-03',mode:'flexible',status:'ended',sessions:[{id:'s',startTime:at('08-03T09:00').toISOString(),endTime:at('08-03T20:00').toISOString()}],updatedAt:at('08-03T20:00').toISOString()}
  const configured={...profile,rosters:[{...plan,templates:[short],pay:{...plan.pay,mode:'hourly' as const,basis:'actual' as const,overtime:'multiplier' as const,overtimeValue:1.5}}]}
  expect(rosterPayForDate(configured,record.date,at('08-03T21:00'),[record])).toBe(220)
  const separate={...record,overtimeSessionId:'o',settlementMode:'full-day' as const,settlementPending:false}
  expect(rosterPayForDate(configured,record.date,at('08-03T21:00'),[separate])).toBe(160)
  for(const [overtime,overtimeValue,total] of [['unpaid',0,160],['fixed',75,235],['multiplier',0,160]] as const) {
    const next={...configured,rosters:[{...configured.rosters[0],pay:{...configured.rosters[0].pay,overtime,overtimeValue}}]}
    expect(rosterPayForDate(next,record.date,at('08-03T21:00'),[record])).toBe(total)
  }
 })
 it('keeps vacation wages without suppressing an explicit duty shift',()=>{
  const configured={...profile,vacations:[{id:'vac',stageId:null,name:'暑假',kind:'summer' as const,startDate:'2026-08-01',endDate:'2026-08-31',payMode:'ratio' as const,value:0.5}],rosters:[{...plan,overrides:[{date:'2026-08-03',shifts:[shift],reason:'值班',keepVacationPay:true}]}]}
  expect(vacationForDate(configured,'2026-08-03')).toBeDefined()
  const summary=summarizeTodayWork(configured,[],at('08-03T11:00'))
  expect(summary.dayType).toBe('work')
  expect(summary.earnedAmount).toBe(350)
  expect(summary.workedSeconds).toBe(7200)
 })
 it('follows the optional national holiday policy without adding a phantom makeup shift',()=>{
  const enabled={...settings,enabled:true}
  const holiday={...plan,overrides:[],anchorDate:'2026-10-01',mode:'cycle' as const}
  const configured={...profile,rosters:[{...holiday,respectHolidays:true}]}
  expect(resolveAttendanceDay(at('10-01T10:00'),configured,undefined,enabled).isWorkday).toBe(false)
  expect(resolveAttendanceDay(at('10-10T10:00'),configured,undefined,enabled).isWorkday).toBe(false)
  expect(resolveAttendanceDay(at('10-01T10:00'),{...configured,rosters:[{...holiday,respectHolidays:false}]},undefined,enabled).isWorkday).toBe(true)
 })
 it('shows long-shift breaks and the next shift while skipping continued days as full rest days',()=>{
  const now=at('08-03T11:00')
  const result=getRestCountdown(profile,summarizeTodayWork(profile,[],now),now,[],[],settings)
  expect(result.featured.target).toEqual(at('08-03T12:00'))
  expect(result.rest?.days).toBe(2)
  expect(result.nextShift?.hint).toBe('2026-08-07 09:00 开始')
 })
 it('attaches legacy rules to the containing job regardless of stage ordering',async()=>{
  const make=(id:string,startDate:string,endDate:string|null)=>({id,name:id,company:'',role:'',createdAt:at('08-01T00:00').toISOString(),startDate,endDate,profile:profileSnapshot(profile)})
  saveJSON(keys.profile,profile)
  const error=await commitJourney(loadProfile(),[make('later','2026-09-01',null),make('old','2026-08-01','2026-08-31')])
  expect(error).toBeNull()
  expect(loadProfile().rosters?.[0].stageId).toBe('old')
 })

 it('keeps actual overtime controllable after the planned end instead of reporting an ended shift',()=>{
  const configured={...profile,rosters:[{...plan,templates:[{...shift,endDay:0,endTime:'18:00'}]}]}
  const record:DailyWorkRecord={date:'2026-08-03',mode:'flexible',status:'working',sessions:[{id:'s',startTime:at('08-03T09:00').toISOString()}],updatedAt:at('08-03T09:00').toISOString()}
  expect(summarizeTodayWork(configured,[record],at('08-03T19:00'))).toMatchObject({status:'working',workedSeconds:9*3600})
 })
 it('checks distant future rule seams when the current template is extended',()=>{
  const short={...shift,endDay:0,endTime:'18:00'}
  const future={...plan,id:'future',effectiveFrom:'2027-01-01',anchorDate:'2027-01-01',templates:[short]}
  const current={...plan,anchorDate:'2026-12-31',templates:[shift]}
  expect(validateRoster(current,{...profile,rosters:[current,future]})).toContain('重叠')
 })

 it('preserves dated personal deductions when a roster belongs to a work stage',()=>{
  const job={id:'job',name:'工作',company:'',role:'',createdAt:at('08-01T00:00').toISOString(),startDate:'2026-08-01',endDate:null,profile:profileSnapshot({...profile,includeLivingCost:false,monthlyLivingCost:0})}
  const configured:SalaryProfile={...profile,includeLivingCost:true,monthlyLivingCost:310,livingCostMode:'deduct',livingCostHistory:[{version:1,effectiveFrom:'2026-08-01',mode:'deduct',monthlyAmount:310}],workJourney:{version:1,revision:1,stages:[job]},rosters:[{...plan,stageId:'job',pay:{...plan.pay,mode:'salary'}}]}
  expect(summarizeTodayWork(configured,[],at('08-03T11:00')).earnedAmount).toBeCloseTo((8400-310)/31)
 })

})
