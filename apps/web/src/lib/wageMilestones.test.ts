import { expect, it } from 'vitest'
import { DEFAULT_PROFILE, type RosterPlan } from '@salary-flow/core'
import { wageMilestoneAmounts } from './wageMilestones'

it('keeps monthly salary milestones on an unplanned manual-roster day', () => {
  const roster: RosterPlan = { id:'r',stageId:null,effectiveFrom:'2026-09-01',enabled:true,mode:'manual',anchorDate:'2026-09-01',templates:[],cycle:[[]],overrides:[],respectVacations:true,respectHolidays:false,pay:{mode:'salary',value:0,basis:'planned',monthlyHours:0,overtime:'manual',overtimeValue:0} }
  const amounts = wageMilestoneAmounts({ ...DEFAULT_PROFILE, salary: 4000, rosters: [roster] }, '2026-09-14')
  expect(amounts.monthly).toBeCloseTo(4000)
  expect(amounts.daily).toBeCloseTo(4000 / 30)
  expect(amounts.weekly).toBeCloseTo(4000 / 30 * 7)
})
