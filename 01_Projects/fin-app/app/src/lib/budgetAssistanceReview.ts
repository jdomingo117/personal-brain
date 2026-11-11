import {dateParts,sumCents,addDays,addMonths,periodContaining,dueDateFunding} from './budget'
import {occurrenceDates,type BudgetItemConfig} from './budgetItems'
import {setupPeriod,type Setup} from './budgetWorkspace'
import type {AssistanceResult,WhatIf} from './budgetAssistance'

export type ReviewedCost={line_id:string;name:string;selected:boolean;confirmed:boolean;paid:boolean;type:'bill'|'reserve';amount_cents:number;opening_cents:number;cadence:BudgetItemConfig['cadence'];anchor:string;due_date:string|null;recurring_id:string|null;target_cents?:number|null}
export type AssistanceReview={apply_income:boolean;apply_everyday:boolean;income:{amount_cents:number;pay_dates:string[];confirmed:boolean};costs:ReviewedCost[];irregular_confirmed:boolean;everyday_cents?:number}
export function costAllocation(cost:ReviewedCost,setup:Setup){
 const p=setupPeriod(setup)
 return cost.type==='bill'?sumCents(occurrenceDates(cost.anchor,cost.cadence,p.start,p.end).map(()=>cost.amount_cents)):cost.amount_cents
}
export function reviewProblem(base:Setup,result:AssistanceResult,r:AssistanceReview|undefined):string|null{
 if(!r)return 'Confirm expected income, pay dates and individual costs before using assistance.'
 try{
  const scope={...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor},p=setupPeriod(scope)
  const income=r.apply_income?r.income.amount_cents:base.income_cents
  if(!r.income.confirmed)return 'Confirm your take-home pay and pay dates.'
  if(!Number.isSafeInteger(income)||income<0||r.income.amount_cents!==income)return 'Enter your take-home pay. 0 is fine if you don’t expect any.'
  if(r.income.pay_dates.length>100||new Set(r.income.pay_dates).size!==r.income.pay_dates.length)return 'Each pay date can only appear once (up to 100).'
  for(const date of r.income.pay_dates){dateParts(date);if(date<p.start||date>=p.end)return 'Pay dates need to fall inside this budget’s dates.'}
  if(income>0&&!r.income.pay_dates.length)return 'Add the pay dates you expect in this budget.'
  if(r.apply_everyday){const chosen=r.everyday_cents??result.suggestions.everyday_cents;if(chosen===null||!Number.isSafeInteger(chosen)||chosen<0)return 'Enter your own everyday amount, since refunds outweighed spending in your history.'}
  if(!r.irregular_confirmed)return 'Review annual, quarterly and other essential costs, deadlines and existing reserves.'
  if(r.costs.length>100||new Set(r.costs.map(c=>c.line_id)).size!==r.costs.length)return 'Check individual cost identities.'
  for(const c of r.costs){
   if(!c.confirmed)return `Confirm ${c.name||'each selected cost'} individually.`
   if(c.paid)return `${c.name} is marked as already paid. Clear that in Edit, then match the payment in the editor after using this draft.`
   if(!c.selected)continue
   if(!c.name.trim()||c.name.trim().length>60||!Number.isSafeInteger(c.amount_cents)||c.amount_cents<0||!Number.isSafeInteger(c.opening_cents)||c.opening_cents<0||!['bill','reserve'].includes(c.type))return 'Each included cost needs a valid name and amount.'
   if(c.type==='bill'&&c.opening_cents!==0)return 'A regular bill can’t have money already set aside. Make it a set-aside, or clear that amount.'
   dateParts(c.anchor);if(c.due_date)dateParts(c.due_date)
   if(c.type==='reserve'&&(!c.due_date||!Number.isSafeInteger(c.target_cents)||c.target_cents!<=0))return 'Each set-aside needs its full bill target and deadline (due date).'
   costAllocation(c,scope)
   if(c.type==='reserve')sumCents([c.opening_cents,c.amount_cents])
   const old=base.lines.find(l=>l.id===c.line_id)
   if(old&&old.kind!==(c.type==='bill'?'fixed':'reserve'))return 'This cost can’t replace an existing amount of a different type.'
  }
  return null
 }catch(e){return (e as Error).message}
}
/** Copy every protected line. Only explicitly selected fields can change. */
export function mergeReviewedAssistance(base:Setup,result:AssistanceResult,r:AssistanceReview){
 const problem=reviewProblem(base,result,r);if(problem)throw Error(problem)
 const scope={...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor}
 const lines=base.lines.map(line=>({...line}))
 for(const cost of r.costs.filter(c=>c.selected)){
  const line={id:cost.line_id,name:cost.name.trim(),kind:cost.type==='bill'?'fixed' as const:'reserve' as const,allocation_cents:costAllocation(cost,scope),opening_cents:cost.opening_cents}
  const index=lines.findIndex(l=>l.id===line.id);if(index<0)lines.push(line);else lines[index]=line
 }
 if(r.apply_everyday){const line=lines.find(l=>l.kind==='everyday');if(!line)throw Error('Keep one everyday allowance.');line.allocation_cents=r.everyday_cents??result.suggestions.everyday_cents!}
 return {...scope,income_cents:r.income.amount_cents,lines}
}
export function reviewedResult(base:Setup,result:AssistanceResult,r:AssistanceReview):AssistanceResult{
 const merged=mergeReviewedAssistance(base,result,r)
 const target=result.target&&r.costs.some(c=>c.recurring_id&&!c.selected)?{...result.target,coverage_complete:false,settled_everyday_cents:null}:result.target
 let projection_blocker:string|undefined
 try{
 for(const cost of r.costs.filter(c=>c.selected&&c.type==='reserve')){const funding=reserveCostFunding(cost,merged,result.target?.as_of);if(funding&&funding.shortfall!>0)projection_blocker='An essential reserve (set-aside) will have a shortfall at its due date. Set aside more before relying on a goal estimate.'}
 const p=setupPeriod(merged),through=addMonths(result.target&&result.target.as_of>p.start?result.target.as_of:p.start,12)
 let next=p,largest=0
 while(next.start<=through){const dated=sumCents(r.costs.filter(c=>c.selected&&c.type==='bill').map(c=>sumCents(occurrenceDates(c.anchor,c.cadence,next.start,next.end>through?addDays(through,1):next.end).map(()=>c.amount_cents))));const selectedNow=sumCents(r.costs.filter(c=>c.selected&&c.type==='bill').map(c=>costAllocation(c,merged)));largest=Math.max(largest,dated-selectedNow);next=periodContaining(next.end,merged.frequency==='monthly'?{frequency:'monthly',timezone:merged.timezone}:{frequency:'fortnightly',timezone:merged.timezone,anchor:merged.anchor!})}
 if(sumCents([...merged.lines.map(l=>l.allocation_cents),largest])>merged.income_cents)projection_blocker='A current or scheduled future bill would leave you short. Check your pay and amounts before relying on a goal estimate.'
 }catch{projection_blocker='We couldn’t check your upcoming bills. Check their dates and amounts before relying on a goal estimate.'}
 if(!projection_blocker&&base.lines.some(line=>line.kind!=='everyday'&&line.id!==base.assistance?.goal_intent?.line_id&&!r.costs.some(c=>c.line_id===line.id&&c.selected&&c.confirmed)&&!base.assistance?.reviewed_inputs?.costs.some(c=>c.line_id===line.id&&c.selected&&c.confirmed)))projection_blocker='One of your existing amounts has no due dates. It’s kept as is, but add its schedule before relying on a goal estimate.'
 return {...result,target,projection_blocker,suggestions:{income_cents:merged.income_cents,everyday_cents:merged.lines.find(l=>l.kind==='everyday')!.allocation_cents,bills_cents:sumCents(merged.lines.filter(l=>l.kind!=='everyday').map(l=>l.allocation_cents))}}
}

export function costStillMatches(cost:ReviewedCost,setup:Setup){try{return costAllocation(cost,setup)}catch{return NaN}}

/** Valid manual entries survive the fallback. Unpriced/unreviewed costs stay
 * visibly unresolved; a paid observation never becomes an outstanding bill. */
export function manualReviewSetup(base:Setup,result:AssistanceResult|null,r:AssistanceReview|undefined,change?:WhatIf):Setup{
 if(!result||!r)return structuredClone(base)
 const scope={...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor,account_ids:[...result.account_ids]}
 const income=Number.isSafeInteger(r.income.amount_cents)&&r.income.amount_cents>=0?r.income.amount_cents:base.income_cents
 const lines=base.lines.map(l=>({...l}))
 const manualEveryday=Number.isSafeInteger(r.everyday_cents)&&r.everyday_cents!>=0?r.everyday_cents:undefined
 if(r.apply_everyday&&manualEveryday!==undefined){const line=lines.find(l=>l.kind==='everyday');if(line)line.allocation_cents=manualEveryday}
 const costs=r.costs.filter(c=>c.name.trim()).map(c=>{
  const safe={...c,amount_cents:Number.isSafeInteger(c.amount_cents)&&c.amount_cents>=0?c.amount_cents:0,opening_cents:Number.isSafeInteger(c.opening_cents)&&c.opening_cents>=0?c.opening_cents:0,confirmed:false}
  try{dateParts(safe.anchor)}catch{safe.anchor=setupPeriod(scope).start}
  if(safe.due_date)try{dateParts(safe.due_date)}catch{safe.due_date=null}
  if(c.selected&&!c.paid){try{const value={id:c.line_id,name:c.name.trim(),kind:c.type==='bill'?'fixed' as const:'reserve' as const,allocation_cents:costAllocation(safe,scope),opening_cents:safe.opening_cents};const i=lines.findIndex(l=>l.id===c.line_id);if(i<0)lines.push(value);else lines[i]=value}catch{safe.selected=false}}
  else safe.selected=false
  return safe
 })
 let goal=base.assistance?.goal_intent
 if(!goal&&change?.destination==='goal'&&change.goal_name?.trim()&&Number.isSafeInteger(change.amount_cents)&&change.amount_cents>0){
  const line={id:crypto.randomUUID(),name:change.goal_name.trim().slice(0,60),kind:'reserve' as const,allocation_cents:change.amount_cents,opening_cents:Number.isSafeInteger(change.goal_opening_cents)&&change.goal_opening_cents!>=0?change.goal_opening_cents!:0}
  sumCents([line.opening_cents,line.allocation_cents]);lines.push(line)
  let due=change.goal_needed_by||null;if(due)try{dateParts(due)}catch{due=null}
  goal={line_id:line.id,name:line.name,target_cents:Number.isSafeInteger(change.goal_target_cents)&&change.goal_target_cents!>0?change.goal_target_cents!:null,needed_by:due}
 }
 const dates=r.income.pay_dates.filter(d=>{try{dateParts(d);return true}catch{return false}})
 return {...scope,income_cents:income,lines,assistance:{method:result.method,fingerprint:result.fingerprint,source_revision:result.source_revision,manual:true,periods:result.periods.map(p=>({start_date:p.start_date,end_date:p.end_date})),provenance:{...base.assistance?.provenance,income:'user-estimate',costs:'unresolved-user-inputs',...(goal&&!base.assistance?.goal_intent?{goal:'manual-allowance-without-a-history-cut'}:{})},reviewed_inputs:{...r,...(r.everyday_cents!==undefined?{everyday_cents:manualEveryday??base.lines.find(l=>l.kind==='everyday')!.allocation_cents}:{}),income:{amount_cents:income,pay_dates:dates,confirmed:false},costs,irregular_confirmed:false},...(goal?{goal_intent:goal}:{})}}
}

export function reserveCostFunding(c:ReviewedCost,setup:Setup,asOf?:string){
 if(c.type!=='reserve'||!c.due_date||!c.target_cents||!asOf)return null
 const p=setupPeriod(setup),start=p.start>asOf?p.start:asOf,included=p.start<=asOf?[p.start]:[]
 return dueDateFunding({target:c.target_cents,reserveRemaining:sumCents([c.opening_cents,included.length?c.amount_cents:0]),netPurchases:0,contribution:c.amount_cents,state:'saving',asOf:start,schedule:setup.frequency==='monthly'?{frequency:'monthly',anchor:p.start,dayOfMonth:1}:{frequency:'fortnightly',anchor:p.start},includedContributionDates:included},c.due_date)
}

export function payDatesStillMatch(setup:Setup,dates:string[]){try{const p=setupPeriod(setup);return dates.every(d=>{dateParts(d);return d>=p.start&&d<p.end})}catch{return false}}

/** The owner's single final review confirms every reviewed input at once. */
export function confirmReview(r:AssistanceReview):AssistanceReview{
 return {...r,income:{...r.income,confirmed:true},irregular_confirmed:true,costs:r.costs.map(c=>({...c,confirmed:true}))}
}
/** Identity of the reviewed values, ignoring confirmation flags: any change means the review must be confirmed again. */
export function reviewSignature(r:AssistanceReview|undefined):string{
 if(!r)return ''
 const {income,costs,irregular_confirmed:_i,...rest}=r
 return JSON.stringify({...rest,income:{...income,confirmed:undefined},costs:costs.map(c=>({...c,confirmed:undefined}))})
}
