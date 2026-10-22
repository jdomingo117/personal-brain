import { addDays,addMonths,contributionDates,goalTiming,dueDateFunding } from './budget'
import type { Snapshot } from './budgetWorkspace'

export type BudgetItemConfig={type:'bill'|'reserve'|'goal'|'contribution';name:string;target_cents:number|null;estimated:boolean;due_date:string|null;cadence:'once'|'weekly'|'fortnightly'|'monthly'|'quarterly'|'annual';anchor:string;amount_cents:number;state:'draft'|'saving'|'paused'|'purchase-recorded';recurring_id:string|null;planning_goal_id:string|null;source_account_id?:string|null;source_merchant_key?:string|null;featured?:boolean;schedule_id?:string;voided?:boolean}
export type BudgetItem={archived?:boolean;archive?:import('./budgetControls').Archive;line_id:string;name:string;kind:'fixed'|'reserve'|'everyday'|'contribution';config:BudgetItemConfig|null;item_revision:string|null;opening_cents:number;opening_date:string;planned_cents:number;reallocated_cents:number;opening_carry_cents?:number|null;remaining_cents:number;used_cents:number;reserve_cents:number|null;net_purchases_cents:number;bank_confirmed_cents:number;user_confirmed_cents:number;changed_claims:number;occurrences:{date:string;expected_cents:number;matched_cents:number}[]}
export type BudgetClaim={id:string;line_id:string|null;purpose:'expense'|'purchase'|'refund'|'exclude'|'funding';source_key:string;source_date:string;amount_cents:number;related_claim_id:string|null;valid:boolean;provenance:string}
export type BudgetLimit={id:string;category_id:string;subcategory_id:string|null;custom_subcategory_id:string|null;amount_cents:number;used_cents?:number;opening_carry_cents?:number|null;remaining_cents?:number|null}
export type BudgetDetails={attention?:import('./budgetAttention').BudgetAttention;lifecycle?:import('./budgetLifecycle').BudgetLifecycle;other_opening_carry_cents?:number|null;recurring_unavailable?:boolean;recurring_evidence?:BudgetRecurringEvidence;items:BudgetItem[];claims:BudgetClaim[];limits:BudgetLimit[];other_flexible_cents:number;other_flexible_used_cents:number;excluded_cents:number;unassigned_credit_cents:number;source_revision:string;plan_version:string;undo_operation_id:string|null;taxonomy:{id:string;name:string}[];planning_goals:{id:string;name:string}[];recurring:{id:string;account_id:string;merchant_key:string;state:string;cadence:string|null;amount_cents:number|null;next_date:string|null}[]}
export type BudgetSource={source_key:string;source_type:'expense'|'refund'|'bank-observed'|'user-confirmed';booking_date:string;capacity:number;available_cents:number;identity:{merchant?:string;note?:string;from_account?:string;to_account?:string;account_id?:string};fingerprint:string}
export type BudgetRecurringEvidence={as_of:string;normal_from:string;annual_from:string;limited:boolean;group_count:number;group_limit:number;observation_limit:number;proposals:{account_id:string;merchant_key:string;count:number;state:'detected'|'early-annual'|'no-pattern'|'manual-required';signal:{cadence:string;expected:number;nextExpected:string;status:'active'|'dormant';kind:'fixed'|'variable';priceChange?:{from:number;to:number;date:string}}|null}[]}
export type BudgetSourcesPage={source_revision:string;plan_version:string;has_more:boolean;total:number;rows:BudgetSource[]}
export type BudgetTaxonomyScope={key:string;name:string;category_id:string;subcategory_id:string|null;custom_subcategory_id:string|null}

export function occurrenceDates(anchor:string,cadence:BudgetItemConfig['cadence'],from:string,until:string):string[] {
 const result:string[]=[]
 // All steps use local dates, never millisecond durations or monthly/2 approximations.
 const monthly=cadence==='monthly'?1:cadence==='quarterly'?3:cadence==='annual'?12:0
 let n=0
 while(n<40000){
  const date=cadence==='once'?anchor:monthly?addMonths(anchor,n*monthly,Number(anchor.slice(8))):addDays(anchor,n*(cadence==='weekly'?7:14))
  if(date>=until)break
  if(date>=from)result.push(date)
  if(cadence==='once')break
  n++
 }
 if(n>=40000)throw Error('Choose a more recent schedule anchor.')
 return result
}
export function itemAllocation(config:BudgetItemConfig,from:string,until:string){
 if(config.state==='draft'||config.state==='paused'||config.state==='purchase-recorded')return 0
 const amount=BigInt(config.amount_cents)*BigInt(occurrenceDates(config.anchor,config.cadence,from,until).length)
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('The bill total is too large to plan safely.')
 return Number(amount)
}
export function goalEstimate(item:BudgetItem,s:Snapshot,asOf:string){
 const c=item.config
 if(!c||c.type!=='goal'||!['monthly','fortnightly'].includes(c.cadence))return null
 const schedule=c.cadence==='monthly'?{frequency:'monthly' as const,anchor:c.anchor,dayOfMonth:Number(c.anchor.slice(8))}:{frequency:'fortnightly' as const,anchor:c.anchor}
 const input={target:c.target_cents,reserveRemaining:item.reserve_cents??0,netPurchases:Math.max(0,item.net_purchases_cents),contribution:c.amount_cents,state:c.state,asOf,schedule,
  includedContributionDates:s.period?contributionDates(schedule,s.period.start_date,addDays(s.period.end_date,-1)):[]}
 return {timing:goalTiming(input,addMonths(asOf,12)),due:c.due_date?dueDateFunding(input,c.due_date):null}
}
export function dateLedAmount(target:number,existing:number,config:BudgetItemConfig,from:string):number|null {
 if(!config.due_date)return null
 const dates=occurrenceDates(config.anchor,config.cadence,from,addDays(config.due_date,1))
 if(!dates.length)return null
 const gap=BigInt(Math.max(0,target-existing)),count=BigInt(dates.length)
 return Number((gap+count-1n)/count)
}
