import {addDays,addMonths,resourceSummary} from './budget'
import {itemAllocation} from './budgetItems'
import type {Snapshot} from './budgetWorkspace'

export type ReviewFacts={period_id:string;start_date:string;end_date:string;
 original_plan:{income_cents:number;drawdown_cents:number;allocations:{line_id:string;amount_cents:number}[]};
 latest_plan:{income_cents:number;drawdown_cents:number;allocations:{id:string;name:string;allocation_cents:number}[]};
 actuals:Snapshot['actuals'];opening_carry_cents:number|null;closing_everyday_cents:number|null;scope_valid:boolean;coverage_complete:boolean;excluded_cents:number;unassigned_credit_cents:number}
export type BudgetLifecycle={state:'past'|'current'|'future';as_of:string;carry_mode:'fresh'|'carry';provisional_carry:boolean;chain_valid:boolean;
 facts:ReviewFacts;review:null|{id:string;version:string;state:'reviewed'|'reopened';carry_mode:'fresh'|'carry';source_revision:string;payload:ReviewFacts;accepted_incomplete:boolean};changed_since_review:boolean;
 previous_id:string|null;next_id:string|null;is_latest:boolean;periods:{id:string;start_date:string;end_date:string;state:string}[]}

/** Bounded plan inputs, never a reducer over fetched source transactions. */
export function nextBudgetDraft(s:Snapshot){
 if(!s.period||!s.plan||!s.future_template||!s.lines)throw Error('Load a saved period first.')
 const start=s.period.end_date,end=s.period.frequency==='monthly'?addMonths(start,1):addDays(start,14)
 return {start,end,income_cents:s.future_template.income_cents,lines:s.future_template.allocations.map(a=>{
  const line=s.lines!.find(l=>l.id===a.line_id)!,item=s.details?.items.find(i=>i.line_id===a.line_id)
  return {line_id:line.id,name:item?.name??line.name,kind:line.kind,amount_cents:a.amount_cents,
   dated_cents:item?.config?itemAllocation(item.config,start,end):null}
 })}
}
export function nextBudgetSummary(income:number,lines:{line_id:string;kind:'everyday'|'fixed'|'reserve'|'contribution';amount_cents:number}[]){
 return resourceSummary(income,0,lines.map(l=>({id:l.line_id,kind:l.kind,amount:l.amount_cents})))
}
