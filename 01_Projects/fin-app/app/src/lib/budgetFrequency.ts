import {frequencyTransition,addDays} from './budget'
import {itemAllocation,occurrenceDates} from './budgetItems'
import {nextBudgetSummary} from './budgetLifecycle'
import type {Snapshot} from './budgetWorkspace'

export type FrequencyTemplate={income_cents:number;accept_gap:boolean;lines:{line_id:string;amount_cents:number}[]}
export type FrequencyChange={id:string;change_id:string;period_id:string;version:string;state:'pending'|'cancelled'|'applied';frequency:'monthly'|'fortnightly';effective_date:string;initial_end:string;continuing_end:string;source_revision:string;needs_review:boolean;
 payload:{initial:FrequencyTemplate;continuing:FrequencyTemplate;limits:{id:string;category_id:string;amount_cents:number}[]}}

/** Preview saved bounded plan inputs only. Source aggregates remain server-owned. */
export function frequencyDraft(s:Snapshot){
 if(!s.period||!s.plan||!s.future_template||!s.lines)throw Error('Load a complete saved plan before changing frequency.')
 const frequency=s.period.frequency==='monthly'?'fortnightly':'monthly'
 const windows=frequencyTransition({start:s.period.start_date,end:s.period.end_date,frequency:s.period.frequency as 'monthly'|'fortnightly',timezone:s.period.timezone,transition:s.period.transition??false},
  frequency==='monthly'?{frequency,timezone:s.period.timezone}:{frequency,timezone:s.period.timezone,anchor:s.period.end_date})
 const template={income_cents:s.future_template.income_cents,accept_gap:false,lines:s.future_template.allocations.map(a=>({...a}))}
 return {frequency,windows,initial:structuredClone(template),continuing:structuredClone(template)}
}
export function frequencyWindow(s:Snapshot,template:FrequencyTemplate,start:string,end:string){
 const lines=template.lines.map(a=>{const line=s.lines?.find(l=>l.id===a.line_id);if(!line)throw Error('An allowance changed. Refresh and review again.');return {...a,kind:line.kind}})
 const summary=nextBudgetSummary(template.income_cents,lines)
 const limitTotal=(s.details?.limits??[]).reduce((total,l)=>total+BigInt(l.amount_cents),0n)
 const pool=lines.find(l=>l.kind==='everyday')?.amount_cents??0
 return {summary,limitsFit:limitTotal<=BigInt(pool),schedules:template.lines.map(line=>{
  const item=s.details?.items.find(i=>i.line_id===line.line_id),c=item?.config
  const dates=c&&c.state==='saving'?occurrenceDates(c.anchor,c.cadence,start,end):[]
  return {line_id:line.line_id,name:item?.name??s.lines?.find(l=>l.id===line.line_id)?.name??'Allowance',dated_cents:c?itemAllocation(c,start,end):null,dates,
   reserve_cents:item?.reserve_cents??null,due_date:c?.due_date??null,target_cents:c?.target_cents??null,
   deadline_dates:c?.state==='saving'&&c.due_date&&c.due_date>=start?occurrenceDates(c.anchor,c.cadence,start,addDays(c.due_date,1)):[]}
 })}
}
