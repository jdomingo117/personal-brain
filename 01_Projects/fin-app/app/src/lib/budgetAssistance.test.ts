import {describe,expect,it,vi} from 'vitest'
import {applyAssistance,assistanceReasons,convertAssistanceToManual,goalWhatIfOutcome,previewWhatIf,type AssistanceResult} from './budgetAssistance'
import {blankSetup} from './budgetWorkspace'

const result:AssistanceResult={method:'budget-assist-v1',source_revision:'7',frequency:'monthly',start_date:'2026-10-01',anchor:'2026-10-01',account_ids:['00000000-0000-4000-8000-000000000001'],account_count:1,invalid_accounts:[],missing_coverage:[],periods:[1,2,3].map(n=>({start_date:`2026-0${n}-01`,end_date:`2026-0${n+1}-01`,label:`m${n}`,expense_cents:10000*n,income_cents:50000})),period_count:3,integrity_ok:true,eligible:true,variable:false,fingerprint:'a'.repeat(64),suggestions:{income_cents:50000,everyday_cents:20000,bills_cents:5000},recurring:[]}

describe('budget assistance',()=>{
  it('keeps suggestions in a draft and conserves a goal what-if',()=>{
    vi.stubGlobal('crypto',{randomUUID:()=> '00000000-0000-4000-8000-000000000099'})
    const setup=applyAssistance(blankSetup(()=>new Date('2026-10-19T00:00:00Z')),result,{amount_cents:3000,destination:'goal',goal_name:'Bike'})
    expect(setup.lines.map(l=>l.allocation_cents)).toEqual([17000,5000,3000])
    expect(setup.assistance?.fingerprint).toBe('a'.repeat(64))
    expect(setup.assistance?.goal_intent?.line_id).toBe(setup.lines[2].id)
    expect(previewWhatIf(result,{amount_cents:3000,destination:'goal'})).toMatchObject({everyday_after:17000,goal_cents:3000})
    vi.unstubAllGlobals()
  })
  it('names incomplete coverage instead of treating it as zero',()=>{
    expect(assistanceReasons({...result,eligible:false,period_count:2,missing_coverage:[{account_id:'a',start_date:'2026-01-01',end_date:'2026-02-01'}]}).join(' ')).toMatch(/excluded, never treated as zero/)
  })
  it('rejects unsupported redirection',()=>expect(()=>previewWhatIf(result,{amount_cents:20001,destination:'unassigned'})).toThrow(/within/))
  it('uses real monthly dates and a bounded horizon for goal outcomes',()=>{
    const outcome=goalWhatIfOutcome(result,{amount_cents:10000,destination:'goal',goal_target_cents:30000,goal_needed_by:'2026-12-01'})
    expect(outcome?.estimate).toEqual({state:'estimated',contributionsNeeded:3,estimatedDate:'2026-12-01'})
    expect(outcome?.deadline?.state).toBe('estimated')
  })
  it('converts stale evidence to a manual estimate without losing goal or future allocation intent',()=>{
    vi.stubGlobal('crypto',{randomUUID:()=> '00000000-0000-4000-8000-000000000099'})
    const setup=applyAssistance(blankSetup(()=>new Date('2026-10-19T00:00:00Z')),result,{amount_cents:3000,destination:'goal',goal_name:'Bike',goal_target_cents:90000,goal_needed_by:'2027-06-01'})
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
