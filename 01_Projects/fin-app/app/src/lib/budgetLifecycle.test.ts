import {it,expect} from 'vitest'
import {nextBudgetDraft,nextBudgetSummary} from './budgetLifecycle'
import type {Snapshot} from './budgetWorkspace'
const s={plan:{frequency:'monthly'},period:{start_date:'2026-09-01',end_date:'2026-10-01',frequency:'monthly'},lines:[{id:'bill',kind:'fixed',name:'Rent'}],future_template:{income_cents:100000,allocations:[{line_id:'bill',amount_cents:40000}]},details:{items:[{line_id:'bill',name:'Weekly rent',config:{type:'bill',cadence:'weekly',anchor:'2026-10-01',amount_cents:10000,state:'saving'}}]}} as unknown as Snapshot
it('previews exact dates while preserving a confirmed template override',()=>{
 const d=nextBudgetDraft(s)
 expect([d.start,d.end,d.lines[0].amount_cents,d.lines[0].dated_cents]).toEqual(['2026-10-01','2026-11-01',40000,50000])
})
it('fortnights advance 14 local dates across a year boundary',()=>{
 const d=nextBudgetDraft({...s,period:{id:'p',start_date:'2026-12-12',end_date:'2026-12-26',frequency:'fortnightly',timezone:'Australia/Sydney'}})
 expect([d.start,d.end]).toEqual(['2026-12-26','2027-01-09'])
})
it('paused contributions do not acquire a new allocation from dates',()=>{
 const copy=structuredClone(s);copy.details!.items[0].config!.state='paused'
 expect(nextBudgetDraft(copy).lines[0].dated_cents).toBe(0)
})
it('summarises new resources only, not carry or opening cash',()=>expect(nextBudgetSummary(10000,[{line_id:'e',kind:'everyday',amount_cents:12500}])).toMatchObject({resources:10000,fundingGap:2500}))
it('rejects unsafe totals instead of rounding or fabricating zero',()=>expect(()=>nextBudgetSummary(Number.MAX_SAFE_INTEGER,[{line_id:'a',kind:'reserve',amount_cents:Number.MAX_SAFE_INTEGER},{line_id:'b',kind:'everyday',amount_cents:1}])).toThrow())
