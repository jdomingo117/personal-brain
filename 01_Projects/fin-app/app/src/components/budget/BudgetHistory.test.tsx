import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import BudgetHistory from './BudgetHistory'
import type {Snapshot} from '../../lib/budgetWorkspace'
import type {ReviewFacts} from '../../lib/budgetLifecycle'
function facts(income:number,spending:number,remainder:number):ReviewFacts{
 return {period_id:'period',start_date:'2026-09-01',end_date:'2026-10-01',original_plan:{income_cents:10000,drawdown_cents:1000,allocations:[{line_id:'line',amount_cents:7000}]},latest_plan:{income_cents:income,drawdown_cents:2000,allocations:[{id:'line',name:'Everyday',allocation_cents:8000}]},actuals:{gross_expense_cents:spending,net_expense_cents:spending,expense_credits_cents:0,earned_income_cents:0,pending_signed_cents:0},opening_carry_cents:0,closing_everyday_cents:remainder,scope_valid:true,coverage_complete:false,excluded_cents:0,unassigned_credit_cents:0}
}
function snapshot():Snapshot{
 return {account_scope:[{role:'activity',start_date:'2026-09-01',end_date:null}],details:{items:[],lifecycle:{facts:facts(20000,5000,-1000),review:{carry_mode:'carry',accepted_incomplete:true,payload:facts(30000,4000,2000)}}}} as unknown as Snapshot
}
describe('historical fact presentation',()=>{
 it('keeps original/latest and recorded plan and activity distinct without changing the record',()=>{
  const s=snapshot(),before=JSON.stringify(s),html=renderToStaticMarkup(<BudgetHistory snapshot={s} stale={false}/>)
  const original=html.split('aria-label="Original plan"')[1].split('</section>')[0]
  const latest=html.split('aria-label="Latest saved plan"')[1].split('</section>')[0]
  const recorded=html.split('aria-label="Plan at last review"')[1].split('</section>')[0]
  expect(original).toContain('$100.00');expect(latest).toContain('$200.00');expect(recorded).toContain('$300.00')
  expect(html).toContain('data-history-value="latest-spending">$50.00');expect(html).toContain('data-history-value="latest-remainder">-$10.00')
  expect(html).toContain('When last recorded: net spending $40.00, everyday remainder $20.00')
  expect(JSON.stringify(s)).toBe(before)
 })
 it('keeps saved category rollover authority separate from whole-pool review choices',()=>{
  const s=snapshot();s.period={id:'period',start_date:'2026-09-01',end_date:'2026-10-01',frequency:'monthly',timezone:'Australia/Sydney'}
  s.details!.rollover_policy={id:'policy',version:'1',action:'saved',timeline:[{from:'2026-10-01',limits:[],rules:[]}]}
  const html=renderToStaticMarkup(<BudgetHistory snapshot={s} stale={false}/>)
  expect(html).toContain('Saved category rollover rules govern the next boundary')
  expect(html).not.toContain('Recorded carry choice:')
 })
 it('does not turn a manual plan into observed zero activity',()=>{
  const s=snapshot();s.account_scope=[]
  const html=renderToStaticMarkup(<BudgetHistory snapshot={s} stale={false}/>)
  expect(html).toContain('data-history-value="latest-spending">Unavailable')
  expect(html).toContain('No activity accounts for these dates')
  expect(html).toContain('When last recorded: net spending $40.00')
 })
 it('keeps unavailable activity distinct from zero and labels previously loaded facts',()=>{
  const s=snapshot();s.details!.lifecycle!.facts.scope_valid=false;s.details!.lifecycle!.facts.closing_everyday_cents=null
  const html=renderToStaticMarkup(<BudgetHistory snapshot={s} stale/>)
  expect(html).toContain('data-history-value="latest-spending">Unavailable');expect(html).toContain('data-history-value="latest-remainder">Unavailable')
  expect(html).toContain('Previously loaded review figures');expect(html).toContain('When last recorded: net spending $40.00')
 })
})
