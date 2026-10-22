import {describe,expect,it} from 'vitest'
import {dateLedAmount,itemAllocation,occurrenceDates,type BudgetItemConfig} from './budgetItems'
const config:BudgetItemConfig={type:'goal',name:'Snowboard',target_cents:90000,estimated:true,due_date:null,cadence:'monthly',anchor:'2026-10-01',amount_cents:10000,state:'saving',recurring_id:null,planning_goal_id:null}
describe('dated bills and goals',()=>{
 it('counts five weekly occurrences rather than a monthly equivalent',()=>expect(occurrenceDates('2026-10-01','weekly','2026-10-01','2026-11-01')).toEqual(['2026-10-01','2026-10-08','2026-10-15','2026-10-22','2026-10-29']))
 it('clamps month end without drifting the anchor day',()=>expect(occurrenceDates('2028-01-31','monthly','2028-01-01','2028-04-01')).toEqual(['2028-01-31','2028-02-29','2028-03-31']))
 it('keeps real fortnightly dates across months',()=>expect(occurrenceDates('2026-10-01','fortnightly','2026-10-01','2026-11-01')).toEqual(['2026-10-01','2026-10-15','2026-10-29']))
 it('uses half-open bounds and excludes an occurrence at the next start',()=>expect(occurrenceDates('2026-10-01','fortnightly','2026-10-01','2026-10-15')).toEqual(['2026-10-01']))
 it('counts contributions on dates even when the budget has another rhythm',()=>expect(itemAllocation({...config,cadence:'fortnightly'},'2026-10-01','2026-11-01')).toBe(30000))
 it.each(['draft','paused','purchase-recorded'] as const)('does not refill inactive %s goals',state=>expect(itemAllocation({...config,state},'2026-10-01','2026-11-01')).toBe(0))
 it('suggests a date-led contribution using real dates and existing savings',()=>expect(dateLedAmount(90000,30000,{...config,due_date:'2027-03-01'},'2026-10-01')).toBe(10000))
 it('does not divide by zero when no dates remain',()=>expect(dateLedAmount(90000,30000,{...config,due_date:'2026-09-30'},'2026-10-01')).toBeNull())
 it('does not manufacture a deadline for date-free goals',()=>expect(dateLedAmount(90000,30000,config,'2026-10-01')).toBeNull())
 it('rejects totals outside exact-cent arithmetic',()=>expect(()=>itemAllocation({...config,cadence:'weekly',amount_cents:Number.MAX_SAFE_INTEGER},'2026-10-01','2026-11-01')).toThrow())
})
