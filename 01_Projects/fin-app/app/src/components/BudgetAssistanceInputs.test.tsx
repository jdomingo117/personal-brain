import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import BudgetAssistanceInputs from './BudgetAssistanceInputs'
import {blankSetup} from '../lib/budgetWorkspace'
import {confirmReview,reviewProblem,reviewSignature,type AssistanceReview} from '../lib/budgetAssistanceReview'
import type {AssistanceResult} from '../lib/budgetAssistance'

const result={method:'budget-assist-v2',source_revision:'3',frequency:'monthly',start_date:'2026-11-01',anchor:'2026-11-01',account_ids:['a'],account_count:1,invalid_accounts:[],missing_coverage:[],periods:[],period_count:6,integrity_ok:true,eligible:true,variable:false,fingerprint:'a'.repeat(64),
  suggestions:{income_cents:620000,everyday_cents:180000,bills_cents:4599},
  income_dates:[{date:'2026-09-04',income_cents:310000},{date:'2026-09-18',income_cents:310000},{date:'2026-10-02',income_cents:310000},{date:'2026-10-16',income_cents:310000},{date:'2026-10-20',income_cents:300}],
  recurring:[{id:'r1',account_id:'a',merchant_key:'kayo',cadence:'Monthly',amount_cents:4599,next_date:'2026-11-18',period_cents:4599}]} as AssistanceResult
const base=()=>blankSetup(()=>new Date('2026-11-11T00:00:00Z'))

function render(preselect:string[]=[],changed?:{pay:boolean;bills:boolean;spending:boolean}){
  let review:AssistanceReview|undefined
  const html=renderToStaticMarkup(<BudgetAssistanceInputs base={base()} result={result} preselect={preselect} changed={changed} onReview={r=>{review=r}}/>)
  return {html,review}
}

describe('assisted setup review screen',()=>{
  it('pre-fills take-home pay, suggested pay dates and the typical everyday amount for a blank setup',()=>{
    const {html}=render()
    expect(html).toContain('value="6200.00"')
    expect(html).toContain('value="2026-11-13, 2026-11-27"')
    expect(html).toContain('paid every two weeks, last on 16 Oct 2026')
    expect(html).toMatch(/type="radio" name="everyday" checked=""[^>]*\/><span>Use my typical month: <strong>\$1,800.00/)
  })
  it('shows each bill as one row with its schedule, editable on demand',()=>{
    const {html}=render(['a|kayo'])
    expect(html).toContain('aria-label="Include kayo" checked=""')
    expect(html).toContain('$45.99 monthly · next 18 Nov 2026')
    expect(html).toContain('1 of 1 included')
    expect(html).not.toContain('I reviewed cost')
  })
})

describe('after a recent change',()=>{
  it('leaves only the changed amounts empty and keeps history for the rest',()=>{
    const {html}=render(['a|kayo'],{pay:true,bills:false,spending:false})
    expect(html).toContain('You said your pay changed')
    expect(html).toMatch(/Take-home pay in this budget \(AUD\)<\/span><input class="budget-input" inputMode="decimal" value=""/)
    expect(html).toMatch(/Pay dates in this budget<\/span><input class="budget-input"[^>]* value=""/)
    expect(html).toContain('Use suggested dates')
    expect(html).toMatch(/name="everyday" checked=""[^>]*\/><span>Use my typical month/)
    expect(html).toContain('aria-label="Include kayo" checked=""')
  })
  it('asks for a new everyday amount when spending changed, keeping the typical month as a guide',()=>{
    const {html}=render([],{pay:false,bills:true,spending:true})
    expect(html).toContain('value="6200.00"')
    expect(html).toMatch(/name="everyday" checked=""[^>]*\/><span>Choose my own amount/)
    expect(html).toContain('Use my typical month: <strong>$1,800.00')
    expect(html).toContain('Open “Edit” on that bill')
  })
})

describe('single final confirmation',()=>{
  const r:AssistanceReview={apply_income:true,apply_everyday:true,income:{amount_cents:620000,pay_dates:['2026-11-13','2026-11-27'],confirmed:false},
    costs:[{line_id:'00000000-0000-4000-8000-000000000004',name:'Kayo',selected:true,confirmed:false,paid:false,type:'bill',amount_cents:4599,opening_cents:0,cadence:'monthly',anchor:'2026-11-18',due_date:null,recurring_id:null}],irregular_confirmed:false}
  it('confirms every reviewed input at once, and nothing counts as confirmed before it',()=>{
    expect(reviewProblem(base(),result,r)).toMatch(/Confirm/)
    expect(reviewProblem(base(),result,confirmReview(r))).toBeNull()
  })
  it('changes signature when a value changes but not when only confirmations do',()=>{
    expect(reviewSignature(confirmReview(r))).toBe(reviewSignature(r))
    expect(reviewSignature({...r,income:{...r.income,amount_cents:610000}})).not.toBe(reviewSignature(r))
    expect(reviewSignature({...r,costs:[{...r.costs[0],selected:false}]})).not.toBe(reviewSignature(r))
  })
})
