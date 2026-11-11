import {payDatesStillMatch,costStillMatches as mergeCostAmount,mergeReviewedAssistance,reviewedResult,type AssistanceReview} from './budgetAssistanceReview'
import {validateSetup,type Setup} from './budgetWorkspace'
import {suggestionGoalTiming,dueDateFunding,dateParts,periodContaining,addMonths,sumCents,subtract} from './budget'

export const BUDGET_ASSIST_METHOD='budget-assist-v2'
export type AssistancePeriod={start_date:string;end_date:string;label:string;expense_cents:number;income_cents:number;recurring_expense_cents?:number;everyday_cents?:number;gross_expense_cents?:number;expense_credit_cents?:number;everyday_gross_cents?:number;everyday_credit_cents?:number}
export type AssistanceResult={
  method:string;source_revision:string;frequency:'monthly'|'fortnightly';start_date:string;anchor:string;
  account_ids:string[];account_count:number;invalid_accounts:{account_id:string;reason:string}[];
  missing_coverage:{account_id:string;start_date:string;end_date:string}[];periods:AssistancePeriod[];period_count:number;
  calendar_month_count?:number;calendar_months?:{start_date:string;end_date:string}[];
  integrity_ok:boolean;eligible:boolean;variable:boolean;fingerprint:string;
  projection_blocker?:string;
  target?:{start_date:string;end_date:string;as_of:string;timezone:string;coverage_complete:boolean;integrity_ok:boolean;settled_everyday_cents:number|null;unassigned_credit_cents?:number|null};
  observations?:{everyday:{median_cents:number|null;min_cents:number|null;max_cents:number|null}};
  income_dates?:{date:string;income_cents:number}[];
  suggestions:{income_cents:number;everyday_cents:number|null;bills_cents:number};
  recurring:{id:string;account_id:string;merchant_key:string;cadence:string;amount_cents:number;next_date:string;period_cents:number}[];
}
export type AssistanceRequest={timezone?:string;frequency:'monthly'|'fortnightly';start_date:string;anchor?:string;account_ids:string[]}
export type WhatIf={amount_cents:number;destination:'unassigned'|'goal';goal_name?:string;goal_target_cents?:number;goal_needed_by?:string;goal_opening_cents?:number;reviewed?:boolean;assumptions_confirmed?:boolean;future_period_confirmed?:boolean;as_of?:string}

/** Legacy monthly period counts already prove the month gate. A fortnight
 * count never substitutes for missing calendar-month evidence. */
export function calendarMonthCount(result:AssistanceResult):number|null{
 const count=result.calendar_month_count??(result.frequency==='monthly'?result.period_count:null)
 return count!==null&&Number.isInteger(count)&&count>=0&&count<=6?count:null
}
export function assistanceEligible(result:AssistanceResult):boolean{
 const months=calendarMonthCount(result)
 return result.method===BUDGET_ASSIST_METHOD&&result.eligible&&result.account_count>0&&!result.invalid_accounts.length&&result.integrity_ok&&
  months!==null&&months>=3&&Number.isInteger(result.period_count)&&result.period_count>=(result.frequency==='monthly'?3:6)
}

/** With coverageShown, omit the reasons the coverage checklist already explains. */
export function assistanceReasons(result:AssistanceResult,{coverageShown=false}:{coverageShown?:boolean}={}):string[]{
  const reasons:string[]=[]
  if(result.method!==BUDGET_ASSIST_METHOD)reasons.push('These observations use an earlier calculation method. Check history again, or continue with your own amounts.')
  if(!result.account_count)reasons.push('Choose at least one AUD activity account to use history-based suggestions.')
  if(result.invalid_accounts.length)reasons.push('One or more selected accounts are unavailable or are not AUD accounts.')
  if(coverageShown)return reasons.concat(result.integrity_ok?[]:['An unresolved transfer could change these totals. Resolve it before using history-based amounts.'])
  if(result.missing_coverage.length)reasons.push('Some account periods do not have complete coverage evidence. They were excluded, never treated as zero.')
  const minimum=result.frequency==='monthly'?3:6
  if(result.period_count<minimum)reasons.push(`At least ${minimum} complete comparable ${result.frequency==='monthly'?'months':'two-week periods'} are needed for a full suggested draft.`)
  const months=calendarMonthCount(result)
  if(months===null)reasons.push('Complete calendar-month coverage is unavailable. Check history again before using fortnightly suggestions.')
  else if(months<3&&(result.frequency==='fortnightly'||result.period_count>=3))reasons.push('At least 3 complete comparable calendar months within the latest 6 complete months are also needed for a full suggested draft.')
  if(!result.integrity_ok)reasons.push('An unresolved transfer could change these totals. Resolve it before using history-based amounts.')
  return reasons
}

export function applyAssistance(base:Setup,result:AssistanceResult,whatIf?:WhatIf,review?:AssistanceReview):Setup{
  if(result.method!==BUDGET_ASSIST_METHOD||!assistanceEligible(result))throw new Error('These suggestions are not ready to use. Continue with your own amounts instead.')
  if(result.source_revision.length<1||!/^[a-f0-9]{64}$/.test(result.fingerprint))throw new Error('The suggestion evidence is incomplete. Check history again.')
  const merged=mergeReviewedAssistance(base,result,review!)
  const effective=reviewedResult(base,result,review!)
  if(whatIf)previewWhatIf(effective,whatIf)
  if(whatIf?.destination==='goal'&&base.assistance?.goal_intent)throw Error('Your existing goal is protected. Leave this change unassigned, or edit the goal separately.')
  const allowance=effective.suggestions.everyday_cents
  if(allowance===null)throw Error('Choose your own non-negative everyday allowance.')
  const amount=whatIf?.amount_cents??0
  if(!Number.isSafeInteger(amount)||amount<0||amount>allowance)throw new Error('Choose an amount within the suggested everyday allowance.')
  if(whatIf?.goal_target_cents!==undefined&&(!Number.isSafeInteger(whatIf.goal_target_cents)||whatIf.goal_target_cents<=0))throw new Error('Enter a positive goal target or leave it unknown.')
  if(whatIf?.destination==='goal'&&(!Number.isSafeInteger(whatIf.goal_opening_cents)||whatIf.goal_opening_cents!<0))throw new Error('Confirm the opening goal reserve, including 0 if none.')
  if(whatIf?.destination==='goal'&&!whatIf.goal_name?.trim())throw new Error('Name the goal before redirecting an amount to it.')
  const lines=merged.lines.map(line=>line.kind==='everyday'?{...line,allocation_cents:line.allocation_cents-amount}:line)
  const goalLine=whatIf?.destination==='goal'&&amount>0?{id:crypto.randomUUID(),kind:'reserve' as const,name:whatIf.goal_name!.trim().slice(0,60),allocation_cents:amount,opening_cents:whatIf?.goal_opening_cents??0}:null
  if(goalLine)lines.push(goalLine)
  const applied:Setup={...merged,timezone:result.target?.timezone??base.timezone,account_ids:[...result.account_ids],lines,
    assistance:{method:result.method,fingerprint:result.fingerprint,source_revision:result.source_revision,manual:false,periods:result.periods.map(p=>({start_date:p.start_date,end_date:p.end_date})),
      reviewed_inputs:{...structuredClone(review!),costs:review!.costs.map(c=>!c.selected?base.assistance?.reviewed_inputs?.costs.find(old=>old.line_id===c.line_id)??c:c)},provenance:{...base.assistance?.provenance,income:'user-confirmed-expected-income-and-pay-dates',everyday:review!.everyday_cents!==undefined?'user-chosen-everyday-allowance':review!.apply_everyday?'median-signed-canonical-net-expense':'preserved-user-allowance',costs:'individually-reviewed-schedules-and-reserves'},
      ...(!goalLine&&base.assistance?.goal_intent?{goal_intent:base.assistance.goal_intent}:{}),
      ...(goalLine?{goal_intent:{line_id:goalLine.id,name:goalLine.name,target_cents:whatIf?.goal_target_cents??null,needed_by:whatIf?.goal_needed_by||null}}:{})}}
  for(const line of applied.lines.filter(l=>l.kind==='reserve'))sumCents([line.opening_cents,line.allocation_cents])
  validateSetup(applied)
  return applied
}

/** Keep the edited money/goal/future allocation, but stop claiming stale history as its authority. */
export function convertAssistanceToManual(setup:Setup):Setup{
  if(!setup.assistance)return setup
  const {goal_intent,...assistance}=setup.assistance
  const goalLine=goal_intent?setup.lines.find(line=>line.id===goal_intent.line_id&&line.kind==='reserve'):null
  const reviewed=assistance.reviewed_inputs
  const inputs=reviewed?{...reviewed,income:{...reviewed.income,amount_cents:setup.income_cents,confirmed:reviewed.income.confirmed&&reviewed.income.amount_cents===setup.income_cents&&payDatesStillMatch(setup,reviewed.income.pay_dates)},costs:reviewed.costs.map(cost=>{const line=setup.lines.find(l=>l.id===cost.line_id);return {...cost,confirmed:cost.confirmed&&!!line&&line.name===cost.name&&line.opening_cents===cost.opening_cents&&line.allocation_cents===mergeCostAmount(cost,setup)}})}:undefined
  return {...setup,assistance:{...assistance,...(inputs?{reviewed_inputs:inputs}:{}),manual:true,provenance:Object.fromEntries(Object.keys(assistance.provenance).map(key=>[key,'user-estimate-preserved-from-assisted-draft'])),
    ...(goalLine&&goal_intent?{goal_intent:{...goal_intent,name:goalLine.name}}:{})}}
}

export function previewWhatIf(result:AssistanceResult,change:WhatIf){
  if(!assistanceEligible(result))throw new Error('Check sufficient complete history before trying a history-based change.')
  const allowance=result.suggestions.everyday_cents
  if(allowance===null||!Number.isSafeInteger(allowance)||allowance<0)throw Error('Choose your own non-negative everyday allowance before trying a change.')
  const amount=change.amount_cents
  if(!Number.isSafeInteger(amount)||amount<0||amount>allowance)throw new Error('Choose an amount within the suggested everyday allowance.')
  const target=assistanceTarget(result)
  if(change.as_of!==target.as_of)throw new Error('The history check is from a different date. Check history again before using this change.')
  if(!change.reviewed)throw new Error('Review the accounts, circumstances and draft amounts before trying a change.')
  if(target.start_date>target.as_of){
    if(!change.future_period_confirmed)throw new Error('Confirm this change is for the selected future period. Current spending stays unchanged.')
  }else{
    if(target.end_date<=target.as_of)throw new Error('Choose a current or future period for this change.')
    if(!target.coverage_complete||!target.integrity_ok||target.settled_everyday_cents===null)throw new Error('Complete current-period spending evidence is unavailable. Check history or choose a future period.')
    const unused=Math.max(0,subtract(allowance,Math.max(0,target.settled_everyday_cents)))
    if(amount>unused)throw new Error('This exceeds unused everyday room after recorded spending. Choose a smaller amount or a future period.')
  }
  return {everyday_before:allowance,everyday_after:allowance-amount,redirected_cents:amount,
    unallocated_cents:change.destination==='unassigned'?amount:0,goal_cents:change.destination==='goal'?amount:0}
}

/** Fail closed on old responses, inconsistent windows and malformed usage. */
export function assistanceTarget(result:AssistanceResult){
 const t=result.target
 if(!t)throw new Error('Check history again for complete target-period evidence.')
 dateParts(t.as_of)
 const period=periodContaining(result.start_date,result.frequency==='monthly'?{frequency:'monthly',timezone:t.timezone}:{frequency:'fortnightly',timezone:t.timezone,anchor:result.anchor})
 if(period.start!==t.start_date||period.end!==t.end_date||t.settled_everyday_cents!==null&&(!Number.isSafeInteger(t.settled_everyday_cents)||t.settled_everyday_cents<0))throw new Error('Check history again for consistent target-period evidence.')
 return t
}

export function assistanceCapacity(result:AssistanceResult){
 if(result.suggestions.everyday_cents===null)throw Error('Choose your own everyday allowance before checking plan capacity.')
 return subtract(result.suggestions.income_cents,sumCents([result.suggestions.everyday_cents,result.suggestions.bills_cents]))
}

export function goalOutcomeReason(result:AssistanceResult,change:WhatIf):string|null{
 if(change.destination!=='goal')return null
 try{
  previewWhatIf(result,change)
  if(!change.goal_name?.trim())return 'Name the goal before estimating timing.'
  if(!Number.isSafeInteger(change.goal_target_cents)||change.goal_target_cents!<=0)return 'Enter a positive goal target before estimating timing.'
  if(change.amount_cents<=0)return 'A positive planned contribution is needed for a timing estimate.'
  if(!Number.isSafeInteger(change.goal_opening_cents)||change.goal_opening_cents!<0)return 'Confirm the amount already set aside, including 0 if none.'
  if(!change.assumptions_confirmed)return 'Confirm expected income and pay dates, essential costs, opening reserve and contribution dates before estimating timing.'
  if(result.projection_blocker)return result.projection_blocker
  const capacity=assistanceCapacity(result)
  if(capacity<0)return 'This draft has a funding gap. Review income and allowances before showing a goal outcome.'
  const t=assistanceTarget(result)
  if(change.goal_needed_by){dateParts(change.goal_needed_by);if(change.goal_needed_by<t.as_of)return 'The deadline has passed. Review the goal date.'}
  return null
 }catch(e){return (e as Error).message}
}

export function goalWhatIfOutcome(result:AssistanceResult,change:WhatIf){
 if(change.destination!=='goal'||!change.goal_target_cents)return null
 if(!assistanceEligible(result))throw new Error('Check sufficient complete history before estimating a history-based goal outcome.')
 if(goalOutcomeReason(result,change))return null
 const t=assistanceTarget(result),asOf=t.start_date>t.as_of?t.start_date:t.as_of
 // Activation includes the selected period's planned contribution once. Opening
 // reserve is separate, explicitly confirmed, and never counted as new income.
 const included=t.start_date<=t.as_of?[t.start_date]:[]
 const input={target:change.goal_target_cents,reserveRemaining:sumCents([change.goal_opening_cents!,included.length?change.amount_cents:0]),netPurchases:0,contribution:change.amount_cents,state:'saving' as const,asOf,
  schedule:result.frequency==='monthly'?{frequency:'monthly' as const,anchor:t.start_date,dayOfMonth:1}:{frequency:'fortnightly' as const,anchor:t.start_date},includedContributionDates:included}
 const estimate=suggestionGoalTiming(input)
 // Never project a deadline beyond the illustrative twelve-month horizon.
 const deadline=change.goal_needed_by&&change.goal_needed_by<=addMonths(asOf,12)?dueDateFunding(input,change.goal_needed_by):null
 return {estimate,deadline,needed_by:change.goal_needed_by??null,horizon:addMonths(asOf,12)}
}
