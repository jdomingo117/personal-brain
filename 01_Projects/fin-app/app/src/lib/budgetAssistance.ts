import type { Setup } from './budgetWorkspace'
import {goalTiming,suggestionGoalTiming} from './budget'

export const BUDGET_ASSIST_METHOD='budget-assist-v1'
export type AssistancePeriod={start_date:string;end_date:string;label:string;expense_cents:number;income_cents:number}
export type AssistanceResult={
  method:string;source_revision:string;frequency:'monthly'|'fortnightly';start_date:string;anchor:string;
  account_ids:string[];account_count:number;invalid_accounts:{account_id:string;reason:string}[];
  missing_coverage:{account_id:string;start_date:string;end_date:string}[];periods:AssistancePeriod[];period_count:number;
  integrity_ok:boolean;eligible:boolean;variable:boolean;fingerprint:string;
  suggestions:{income_cents:number;everyday_cents:number;bills_cents:number};
  recurring:{id:string;account_id:string;merchant_key:string;cadence:string;amount_cents:number;next_date:string;period_cents:number}[];
}
export type AssistanceRequest={frequency:'monthly'|'fortnightly';start_date:string;anchor?:string;account_ids:string[]}
export type WhatIf={amount_cents:number;destination:'unassigned'|'goal';goal_name?:string;goal_target_cents?:number;goal_needed_by?:string}

export function assistanceReasons(result:AssistanceResult):string[]{
  const reasons:string[]=[]
  if(!result.account_count)reasons.push('Choose at least one AUD activity account to use history-based suggestions.')
  if(result.invalid_accounts.length)reasons.push('One or more selected accounts are unavailable or are not AUD accounts.')
  if(result.missing_coverage.length)reasons.push('Some account periods do not have complete coverage evidence. They were excluded, never treated as zero.')
  const minimum=result.frequency==='monthly'?3:6
  if(result.period_count<minimum)reasons.push(`At least ${minimum} complete comparable ${result.frequency==='monthly'?'months':'two-week periods'} are needed for a full suggested draft.`)
  if(!result.integrity_ok)reasons.push('An unresolved transfer could change these totals. Resolve it before using history-based amounts.')
  return reasons
}

export function applyAssistance(base:Setup,result:AssistanceResult,whatIf?:WhatIf):Setup{
  if(result.method!==BUDGET_ASSIST_METHOD||!result.eligible)throw new Error('These suggestions are not ready to use. Continue with your own amounts instead.')
  if(result.source_revision.length<1||!/^[a-f0-9]{64}$/.test(result.fingerprint))throw new Error('The suggestion evidence is incomplete. Check history again.')
  const amount=whatIf?.amount_cents??0
  if(!Number.isSafeInteger(amount)||amount<0||amount>result.suggestions.everyday_cents)throw new Error('Choose an amount within the suggested everyday allowance.')
  if(whatIf?.destination==='goal'&&!whatIf.goal_name?.trim())throw new Error('Name the goal before redirecting an amount to it.')
  const everyday={...base.lines.find(l=>l.kind==='everyday')!,allocation_cents:result.suggestions.everyday_cents-amount}
  const lines=[everyday]
  if(result.suggestions.bills_cents>0)lines.push({id:crypto.randomUUID(),kind:'fixed' as const,name:'Confirmed regular bills',allocation_cents:result.suggestions.bills_cents,opening_cents:0})
  const goalLine=whatIf?.destination==='goal'&&amount>0?{id:crypto.randomUUID(),kind:'reserve' as const,name:whatIf.goal_name!.trim().slice(0,60),allocation_cents:amount,opening_cents:0}:null
  if(goalLine)lines.push(goalLine)
  return {...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor,account_ids:[...result.account_ids],income_cents:result.suggestions.income_cents,lines,
    assistance:{method:result.method,fingerprint:result.fingerprint,source_revision:result.source_revision,manual:false,periods:result.periods.map(p=>({start_date:p.start_date,end_date:p.end_date})),
      provenance:{income:'median-observed-earned-income',everyday:'median-canonical-net-expense',bills:'confirmed-recurring-schedules'},
      ...(goalLine?{goal_intent:{line_id:goalLine.id,name:goalLine.name,target_cents:whatIf?.goal_target_cents??null,needed_by:whatIf?.goal_needed_by||null}}:{})}}
}

/** Keep the edited money/goal/future allocation, but stop claiming stale history as its authority. */
export function convertAssistanceToManual(setup:Setup):Setup{
  if(!setup.assistance)return setup
  const {goal_intent,...assistance}=setup.assistance
  const goalLine=goal_intent?setup.lines.find(line=>line.id===goal_intent.line_id&&line.kind==='reserve'):null
  return {...setup,assistance:{...assistance,manual:true,provenance:Object.fromEntries(Object.keys(assistance.provenance).map(key=>[key,'user-estimate-preserved-from-assisted-draft'])),
    ...(goalLine&&goal_intent?{goal_intent:{...goal_intent,name:goalLine.name}}:{})}}
}

export function previewWhatIf(result:AssistanceResult,change:WhatIf){
  const amount=change.amount_cents
  if(!Number.isSafeInteger(amount)||amount<0||amount>result.suggestions.everyday_cents)throw new Error('Choose an amount within the suggested everyday allowance.')
  return {everyday_before:result.suggestions.everyday_cents,everyday_after:result.suggestions.everyday_cents-amount,redirected_cents:amount,
    unallocated_cents:change.destination==='unassigned'?amount:0,goal_cents:change.destination==='goal'?amount:0}
}

export function goalWhatIfOutcome(result:AssistanceResult,change:WhatIf){
  if(change.destination!=='goal'||!change.goal_target_cents)return null
  if(!Number.isSafeInteger(change.goal_target_cents)||change.goal_target_cents<=0||change.amount_cents<=0)throw new Error('Enter a positive goal target and regular amount for a timing estimate.')
  const schedule=result.frequency==='monthly'
    ?{frequency:'monthly' as const,anchor:result.start_date,dayOfMonth:Number(result.start_date.slice(8,10))}
    :{frequency:'fortnightly' as const,anchor:result.anchor}
  const input={target:change.goal_target_cents,reserveRemaining:0,netPurchases:0,contribution:change.amount_cents,state:'saving' as const,asOf:result.start_date,schedule,includedContributionDates:[]}
  const estimate=suggestionGoalTiming(input)
  const deadline=change.goal_needed_by?goalTiming(input,change.goal_needed_by):null
  return {estimate,deadline,needed_by:change.goal_needed_by??null}
}
