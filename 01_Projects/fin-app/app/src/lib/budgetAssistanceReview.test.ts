import {describe,it,expect} from 'vitest'
import {applyAssistance,assistanceReasons,convertAssistanceToManual,type AssistanceResult} from './budgetAssistance'
import {reviewProblem,reviewedResult,manualReviewSetup,type AssistanceReview} from './budgetAssistanceReview'
import {blankSetup} from './budgetWorkspace'
const result:AssistanceResult={method:'budget-assist-v2',source_revision:'3',frequency:'monthly',start_date:'2026-10-26',anchor:'2026-10-01',account_ids:[],account_count:1,invalid_accounts:[],missing_coverage:[],periods:[{start_date:'2026-09-01',end_date:'2026-10-01',label:'September',expense_cents:10000,income_cents:50000}],period_count:3,integrity_ok:true,eligible:true,variable:false,fingerprint:'a'.repeat(64),suggestions:{income_cents:50000,everyday_cents:20000,bills_cents:10000},recurring:[],target:{start_date:'2026-10-01',end_date:'2026-11-01',as_of:'2026-10-26',timezone:'Australia/Sydney',coverage_complete:true,integrity_ok:true,settled_everyday_cents:0}}
const base=()=>({...blankSetup(()=>new Date('2026-10-26T00:00:00Z')),income_cents:70000,opening_drawdown_cents:5000,destination_account_ids:['preserved-destination'],lines:[{id:'00000000-0000-4000-8000-000000000001',name:'My everyday',kind:'everyday' as const,allocation_cents:30000,opening_cents:0},{id:'00000000-0000-4000-8000-000000000002',name:'Protected rent',kind:'fixed' as const,allocation_cents:20000,opening_cents:0},{id:'00000000-0000-4000-8000-000000000003',name:'Protected goal',kind:'reserve' as const,allocation_cents:5000,opening_cents:10000}]})
const review=():AssistanceReview=>({apply_income:false,apply_everyday:true,income:{amount_cents:70000,pay_dates:['2026-10-15'],confirmed:true},costs:[{line_id:'00000000-0000-4000-8000-000000000004',name:'Insurance',selected:true,confirmed:true,paid:false,type:'bill',amount_cents:1000,opening_cents:0,cadence:'weekly',anchor:'2026-10-02',due_date:null,recurring_id:null}],irregular_confirmed:true})
describe('R04 explicit inputs and preservation',()=>{
 it('fails closed without individually confirmed income/dates/costs',()=>{
  expect(()=>applyAssistance(base(),result)).toThrow(/Confirm/)
  const r=review();r.income.pay_dates=[];expect(reviewProblem(base(),result,r)).toMatch(/pay dates/)
  r.income.amount_cents=0;expect(reviewProblem(base(),result,r)).toMatch(/take-home/)
  r.apply_income=true;expect(reviewProblem(base(),result,r)).toBeNull()
  r.costs[0].confirmed=false;expect(reviewProblem(base(),result,r)).toMatch(/Confirm Insurance/)
 })
 it('replaces only selected fields and keeps protected amounts, IDs, reserves, scope and top-up',()=>{
  const original=base(),before=structuredClone(original),r=review(),next=applyAssistance(original,result,undefined,r)
  expect(next.income_cents).toBe(70000);expect(next.opening_drawdown_cents).toBe(5000);expect(next.destination_account_ids).toEqual(original.destination_account_ids)
  expect(next.lines[0]).toEqual({...original.lines[0],allocation_cents:20000})
  expect(next.lines.slice(1,3)).toEqual(original.lines.slice(1))
  expect(next.lines[3].allocation_cents).toBe(5000) // Five actual Fridays; no monthly average.
  expect(original).toEqual(before)
  expect(reviewedResult(original,result,r).suggestions).toEqual({income_cents:70000,everyday_cents:20000,bills_cents:30000})
 })
 it('keeps the everyday amount unless explicitly selected and never silently aggregates bills',()=>{
  const r=review();r.apply_everyday=false;r.apply_income=true;r.income.amount_cents=65000
  const next=applyAssistance(base(),result,undefined,r)
  expect(next.lines[0].allocation_cents).toBe(30000);expect(next.income_cents).toBe(65000)
  expect(next.lines.map(l=>l.name)).toEqual(['My everyday','Protected rent','Protected goal','Insurance'])
  expect(next.assistance?.reviewed_inputs?.income.pay_dates).toEqual(['2026-10-15'])
 })
 it('blocks paid observations and preserves manual entries without making a new outstanding bill',()=>{
  const r=review();r.costs[0].paid=true;r.apply_income=true;r.income.amount_cents=60000
  expect(()=>applyAssistance(base(),result,undefined,r)).toThrow(/already paid/)
  const next=manualReviewSetup(base(),result,r)
  expect(next.lines).toEqual(base().lines);expect(next.income_cents).toBe(60000)
  expect(next.assistance?.manual).toBe(true);expect(next.assistance?.reviewed_inputs?.costs[0].paid).toBe(true)
 })
 it('keeps unknown essential inputs unresolved and does not erase existing goal metadata',()=>{
  const r=review();r.costs[0].amount_cents=NaN
  expect(reviewProblem(base(),result,r)).toMatch(/valid/)
  const existing={...base(),assistance:{method:result.method,fingerprint:result.fingerprint,source_revision:'1',manual:true,periods:result.periods,provenance:{},goal_intent:{line_id:base().lines[2].id,name:'Protected goal',target_cents:90000,needed_by:'2027-01-01'}}}
  const next=manualReviewSetup(existing,result,r)
  expect(next.assistance?.goal_intent).toEqual(existing.assistance.goal_intent)
  expect(next.assistance?.reviewed_inputs?.costs[0]).toMatchObject({amount_cents:0,confirmed:false})
 })
 it('retains a reviewed schedule through conversion and invalidates only edited linked inputs',()=>{
  const first=applyAssistance(base(),result,undefined,review())
  const unchanged=convertAssistanceToManual({...first,opening_drawdown_cents:6000})
  expect(unchanged.assistance?.reviewed_inputs).toEqual(first.assistance?.reviewed_inputs)
  const edited=convertAssistanceToManual({...first,income_cents:65000,lines:first.lines.map(l=>l.name==='Insurance'?{...l,allocation_cents:1}:l)})
  expect(edited.assistance?.reviewed_inputs?.income).toMatchObject({amount_cents:65000,confirmed:false,pay_dates:['2026-10-15']})
  expect(edited.assistance?.reviewed_inputs?.costs[0].confirmed).toBe(false)
  expect(edited.lines.slice(1,3)).toEqual(first.lines.slice(1,3))
 })
 it('withholds outcomes for a scheduled future bill gap without altering the protected current plan',()=>{
  const r=review();r.costs[0]={...r.costs[0],cadence:'annual',anchor:'2027-01-01',amount_cents:60000}
  const effective=reviewedResult(base(),result,r)
  expect(effective.projection_blocker).toMatch(/scheduled future bill/)
  expect(effective.suggestions.bills_cents).toBe(25000)
  expect(applyAssistance(base(),result,undefined,r).lines[3].allocation_cents).toBe(0)
 })
 it('requires a known essential reserve target/deadline and exposes a deadline shortfall',()=>{
  const r=review();r.costs[0]={...r.costs[0],type:'reserve',amount_cents:1000,opening_cents:1000}
  expect(reviewProblem(base(),result,r)).toMatch(/target and deadline/)
  r.costs[0].target_cents=100000;r.costs[0].due_date='2026-11-01'
  expect(reviewProblem(base(),result,r)).toBeNull()
  expect(reviewedResult(base(),result,r).projection_blocker).toMatch(/essential reserve.*shortfall/)
 })

 it('retains a newly entered goal in manual mode without pretending to reverse current spending',()=>{
  const original=base(),r=review(),next=manualReviewSetup(original,result,r,{destination:'goal',amount_cents:10000,goal_name:'Bike',goal_target_cents:90000,goal_needed_by:'2027-06-01',goal_opening_cents:3000})
  expect(next.lines[0]).toEqual(original.lines[0])
  expect(next.lines.at(-1)).toMatchObject({name:'Bike',allocation_cents:10000,opening_cents:3000})
  expect(next.assistance?.goal_intent).toMatchObject({name:'Bike',target_cents:90000,needed_by:'2027-06-01'})
  expect(next.assistance?.provenance.goal).toBe('manual-allowance-without-a-history-cut')
  expect(next.assistance?.manual).toBe(true)
 })

 it('keeps negative observations separate from non-negative user-chosen allocations',()=>{
  const signed={...result,observations:{everyday:{median_cents:-51,min_cents:-300,max_cents:20}},suggestions:{...result.suggestions,everyday_cents:null}}
  const r=review()
  expect(()=>applyAssistance(base(),signed,undefined,r)).toThrow(/own non-negative/)
  r.everyday_cents=0
  const next=applyAssistance(base(),signed,undefined,r)
  expect(next.lines[0].allocation_cents).toBe(0)
  expect(next.income_cents).toBe(70000)
  expect(next.lines.slice(1,3)).toEqual(base().lines.slice(1))
  expect(next.assistance?.provenance.everyday).toBe('user-chosen-everyday-allowance')
  expect(manualReviewSetup(base(),signed,r).lines[0].allocation_cents).toBe(0)
 })
 it('preserves an explicit everyday override through source conversion and flags the old estimator',()=>{
  const r=review();r.everyday_cents=12345
  const next=applyAssistance(base(),result,undefined,r)
  expect(convertAssistanceToManual(next).assistance?.reviewed_inputs?.everyday_cents).toBe(12345)
  expect(()=>applyAssistance(base(),{...result,method:'budget-assist-v1'},undefined,r)).toThrow(/not ready/)
  expect(assistanceReasons({...result,method:'budget-assist-v1'}).join(' ')).toMatch(/earlier calculation method/)
  const legacy=convertAssistanceToManual({...next,assistance:{...next.assistance!,method:'budget-assist-v1'}})
  expect(legacy.lines).toEqual(next.lines);expect(legacy.assistance?.manual).toBe(true)
 })

})
