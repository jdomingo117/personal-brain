import {describe,expect,it,vi} from 'vitest'
import {applyAssistance as applyRaw,assistanceReasons,assistanceEligible,calendarMonthCount,assistanceCapacity,goalOutcomeReason,convertAssistanceToManual,goalWhatIfOutcome,previewWhatIf,type AssistanceResult} from './budgetAssistance'
import {blankSetup} from './budgetWorkspace'

const result:AssistanceResult={target:{start_date:'2026-10-01',end_date:'2026-11-01',as_of:'2026-10-19',timezone:'Australia/Sydney',coverage_complete:true,integrity_ok:true,settled_everyday_cents:0},method:'budget-assist-v2',source_revision:'7',frequency:'monthly',start_date:'2026-10-01',anchor:'2026-10-01',account_ids:['00000000-0000-4000-8000-000000000001'],account_count:1,invalid_accounts:[],missing_coverage:[],periods:[1,2,3].map(n=>({start_date:`2026-0${n}-01`,end_date:`2026-0${n+1}-01`,label:`m${n}`,expense_cents:10000*n,income_cents:50000})),period_count:3,integrity_ok:true,eligible:true,variable:false,fingerprint:'a'.repeat(64),suggestions:{income_cents:50000,everyday_cents:20000,bills_cents:5000},recurring:[]}

const applyAssistance=(base:Parameters<typeof applyRaw>[0],r:AssistanceResult,change?:Parameters<typeof applyRaw>[2])=>applyRaw(base,r,change,{apply_income:true,apply_everyday:true,income:{amount_cents:r.suggestions.income_cents,pay_dates:[r.target?.start_date??r.start_date],confirmed:true},costs:r.suggestions.bills_cents?[{line_id:'00000000-0000-4000-8000-000000000080',name:'Reviewed bill',selected:true,confirmed:true,paid:false,type:'bill',amount_cents:r.suggestions.bills_cents,opening_cents:0,cadence:'monthly',anchor:r.target?.start_date??r.start_date,due_date:null,recurring_id:null}]:[],irregular_confirmed:true})

describe('budget assistance',()=>{
  it('keeps suggestions in a draft and conserves a goal what-if',()=>{
    let id=90;vi.stubGlobal('crypto',{randomUUID:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`})
    const setup=applyAssistance(blankSetup(()=>new Date('2026-10-19T00:00:00Z')),result,{as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:3000,destination:'goal',goal_name:'Bike'})
    expect(setup.lines.map(l=>l.allocation_cents)).toEqual([17000,5000,3000])
    expect(setup.assistance?.fingerprint).toBe('a'.repeat(64))
    expect(setup.assistance?.goal_intent?.line_id).toBe(setup.lines[2].id)
    expect(previewWhatIf(result,{as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:3000,destination:'goal'})).toMatchObject({everyday_after:17000,goal_cents:3000})
    vi.unstubAllGlobals()
  })
  it('names incomplete coverage instead of treating it as zero',()=>{
    expect(assistanceReasons({...result,eligible:false,period_count:2,missing_coverage:[{account_id:'a',start_date:'2026-01-01',end_date:'2026-02-01'}]}).join(' ')).toMatch(/excluded, never treated as zero/)
  })
  it('rejects unsupported redirection',()=>expect(()=>previewWhatIf(result,{as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:20001,destination:'unassigned'})).toThrow(/within/))
  it('uses real monthly dates and a bounded horizon for goal outcomes',()=>{
    const outcome=goalWhatIfOutcome(result,{as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:10000,destination:'goal',goal_name:'Bike',goal_target_cents:30000,goal_needed_by:'2026-12-01'})
    expect(outcome?.estimate).toEqual({state:'estimated',contributionsNeeded:2,estimatedDate:'2026-12-01'})
    expect(outcome?.deadline?.shortfall).toBe(0)
  })
  it('converts stale evidence to a manual estimate without losing goal or future allocation intent',()=>{
    let id=90;vi.stubGlobal('crypto',{randomUUID:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`})
    const setup=applyAssistance(blankSetup(()=>new Date('2026-10-19T00:00:00Z')),result,{as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:3000,destination:'goal',goal_name:'Bike',goal_target_cents:90000,goal_needed_by:'2027-06-01'})
    const manual=convertAssistanceToManual(setup)
    expect(manual.lines).toEqual(setup.lines)
    expect(manual.assistance?.goal_intent).toEqual(setup.assistance?.goal_intent)
    expect(manual.assistance?.manual).toBe(true)
    expect(new Set(Object.values(manual.assistance!.provenance))).toEqual(new Set(['user-estimate-preserved-from-assisted-draft']))
    const renamed=convertAssistanceToManual({...setup,lines:setup.lines.map(line=>line.id===setup.assistance?.goal_intent?.line_id?{...line,name:'Touring bike'}:line)})
    expect(renamed.assistance?.goal_intent?.name).toBe('Touring bike')
    expect(convertAssistanceToManual({...setup,lines:setup.lines.filter(line=>line.id!==setup.assistance?.goal_intent?.line_id)}).assistance?.goal_intent).toBeUndefined()
    vi.unstubAllGlobals()
  })
})


describe('independent fortnightly calendar evidence',()=>{
 const fortnight={...result,frequency:'fortnightly' as const,period_count:6,calendar_month_count:3}
 it('requires both gates even when a legacy eligibility flag is true',()=>{
  expect(assistanceEligible(fortnight)).toBe(true)
  expect(assistanceEligible({...fortnight,calendar_month_count:2})).toBe(false)
  expect(assistanceEligible({...fortnight,period_count:5})).toBe(false)
  expect(assistanceReasons({...fortnight,calendar_month_count:2}).join(' ')).toMatch(/3 complete comparable calendar months/)
 })
 it('fails closed on missing or malformed fortnight calendar proof while retaining monthly compatibility',()=>{
  for(const count of [undefined,NaN,2.5,-1,7]){
   const response={...fortnight,calendar_month_count:count}
   expect(calendarMonthCount(response)).toBeNull();expect(assistanceEligible(response)).toBe(false)
  }
  expect(assistanceEligible(result)).toBe(true)
 })
 it('does not expose full drafts, history what-ifs or goal outcomes below either gate',()=>{
  const response={...fortnight,calendar_month_count:2},change={as_of:'2026-10-19',reviewed:true,goal_opening_cents:0,assumptions_confirmed:true,amount_cents:1000,destination:'goal' as const,goal_name:'Trip',goal_target_cents:10000}
  expect(()=>applyAssistance(blankSetup(),response,change)).toThrow(/not ready/)
  expect(()=>previewWhatIf(response,change)).toThrow(/complete history/)
  expect(()=>goalWhatIfOutcome(response,change)).toThrow(/complete history/)
  expect(response.suggestions).toEqual(result.suggestions)
 })
})


describe('R03 reviewed room and goal readiness',()=>{
 const change={as_of:'2026-10-19',amount_cents:3000,destination:'goal' as const,goal_name:'Bike',goal_target_cents:30000,goal_opening_cents:0,reviewed:true,assumptions_confirmed:true}
 const current=(usage:number|null)=>({...result,target:{...result.target!,settled_everyday_cents:usage}})
 it('preserves current spending, permits the exact unused boundary and blocks one cent beyond',()=>{
  expect(previewWhatIf(current(17000),change).everyday_after).toBe(17000)
  expect(()=>previewWhatIf(current(17001),change)).toThrow(/unused/)
  expect(()=>applyAssistance(blankSetup(),current(20001),change)).toThrow(/unused/)
  expect(previewWhatIf(current(20001),{...change,amount_cents:0}).everyday_after).toBe(20000)
  expect(()=>previewWhatIf(current(-1000),{...change,amount_cents:20001})).toThrow(/within/)
 })
 it('fails closed on missing, inconsistent, incomplete or ambiguous current usage',()=>{
  for(const target of [undefined,{...result.target!,coverage_complete:false},{...result.target!,integrity_ok:false},{...result.target!,settled_everyday_cents:null},{...result.target!,settled_everyday_cents:NaN},{...result.target!,start_date:'2026-10-19'}])expect(()=>previewWhatIf({...result,target},change)).toThrow()
  expect(()=>previewWhatIf(result,{...change,reviewed:false})).toThrow(/Review/)
  expect(()=>previewWhatIf(result,{...change,as_of:'2026-10-20'})).toThrow(/different date/)
 })
 it('requires explicit future intent and keeps the chosen future window intact',()=>{
  const future={...result,start_date:'2026-11-19',target:{...result.target!,start_date:'2026-11-01',end_date:'2026-12-01',coverage_complete:false,settled_everyday_cents:null}}
  expect(()=>previewWhatIf(future,change)).toThrow(/future/)
  expect(previewWhatIf(future,{...change,future_period_confirmed:true}).redirected_cents).toBe(3000)
  expect(goalWhatIfOutcome(future,{...change,future_period_confirmed:true,amount_cents:10000})?.estimate.estimatedDate).toBe('2027-01-01')
 })
 it('shows allocation arithmetic but no successful timing for a funding gap or unreviewed inputs',()=>{
  const gap={...result,suggestions:{...result.suggestions,income_cents:24999}}
  expect(previewWhatIf(gap,change).goal_cents).toBe(3000)
  expect(assistanceCapacity(gap)).toBe(-1)
  expect(goalOutcomeReason(gap,change)).toMatch(/funding gap/)
  expect(goalWhatIfOutcome(gap,change)).toBeNull()
  for(const ch of [{...change,assumptions_confirmed:false},{...change,goal_opening_cents:undefined},{...change,goal_target_cents:undefined},{...change,amount_cents:0}])expect(goalWhatIfOutcome(result,ch)).toBeNull()
 })
 it('counts opening reserve and the selected current contribution once, never past contributions',()=>{
  const outcome=goalWhatIfOutcome(result,{...change,amount_cents:10000,goal_opening_cents:10000,goal_needed_by:'2026-10-31'})!
  expect(outcome.estimate.estimatedDate).toBe('2026-11-01')
  expect(outcome.deadline).toMatchObject({dates:[],shortfall:10000,suggestedContribution:null})
  expect(goalWhatIfOutcome(result,{...change,amount_cents:10000,goal_opening_cents:20000})?.estimate.state).toBe('covered')
  expect(applyAssistance(blankSetup(),result,{...change,goal_opening_cents:10000}).lines[1].opening_cents).toBe(0)
  expect(applyAssistance(blankSetup(),result,{...change,goal_opening_cents:10000}).lines[2].opening_cents).toBe(10000)
 })
 it('normalizes fortnightly dates, bounds the horizon and does not claim a distant deadline success',()=>{
  const fortnight={...result,frequency:'fortnightly' as const,period_count:6,calendar_month_count:3,anchor:'2026-10-05',start_date:'2026-10-26',target:{...result.target!,start_date:'2026-10-19',end_date:'2026-11-02',as_of:'2026-10-26'}}
  expect(goalWhatIfOutcome(fortnight,{...change,as_of:'2026-10-26',amount_cents:10000})?.estimate.estimatedDate).toBe('2026-11-16')
  const far=goalWhatIfOutcome(result,{...change,goal_target_cents:10000000,goal_needed_by:'2030-01-01'})!
  expect(far.estimate).toMatchObject({state:'beyond-horizon',estimatedDate:null})
  expect(far.deadline).toBeNull()
  expect(goalWhatIfOutcome(result,{...change,goal_needed_by:'2026-10-18'})).toBeNull()
 })
 it('does not turn unassigned current refunds into unused source room',()=>{
  const current={...result,target:{...result.target!,settled_everyday_cents:15000,unassigned_credit_cents:-10000}}
  const change={as_of:'2026-10-19',reviewed:true,amount_cents:5000,destination:'unassigned' as const}
  expect(previewWhatIf(current,change).everyday_after).toBe(15000)
  expect(()=>previewWhatIf(current,{...change,amount_cents:5001})).toThrow(/unused/)
  expect(()=>previewWhatIf({...current,target:{...current.target,settled_everyday_cents:-1}},change)).toThrow(/consistent target/)
 })

})
