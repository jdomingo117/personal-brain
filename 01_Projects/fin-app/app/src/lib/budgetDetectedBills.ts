import {nextChargeDate,type Recurring,type Series} from './recurring'
import type {AssistanceResult} from './budgetAssistance'
import {stoppedOrGap} from './budgetBillSuggestions'

export const billKey=(accountId:string,merchantKey:string)=>`${accountId}|${merchantKey}`

/** `importGap`: the detector calls it dormant only because the account's imports
 * stop before its next expected charge, not because a charge was missed. */
export type DetectedBill={series:Series;key:string;fixed:boolean;addable:boolean;importGap:boolean}

/**
 * Regular payments the Recurring detector found on the checked accounts that
 * assisted setup can't use yet. Assistance only counts saved series with a
 * pinned cadence, amount and next date (they are removed from everyday spending
 * server-side), so these are offered to the owner rather than assumed.
 *
 * A dormant series is still offered when its next expected charge falls after
 * the account's last recorded activity: missing imports are not evidence that a
 * bill stopped. Fixed amounts first, then by monthly cost.
 */
export function detectedBills(recurring:Recurring,result:AssistanceResult,lastActivity:Map<string,string|null>=new Map()):DetectedBill[]{
  const accounts=new Set(result.account_ids)
  const used=new Set(result.recurring.map(r=>billKey(r.account_id,r.merchant_key)))
  const importGap=(s:Series)=>stoppedOrGap(s.nextExpected,lastActivity.get(s.accountId))==='import-gap'
  return [...recurring.active.map(s=>({s,gap:false})),...recurring.dormant.filter(importGap).map(s=>({s,gap:true}))]
    .filter(({s})=>accounts.has(s.accountId)&&s.trackingState!=='stopped'&&s.trackingState!=='dismissed'&&!used.has(billKey(s.accountId,s.merchantKey)))
    .map(({s,gap})=>({series:s,key:billKey(s.accountId,s.merchantKey),fixed:s.kind==='fixed',importGap:gap,
      addable:s.charges.filter(c=>c.transactionId).length>=3&&Number.isSafeInteger(s.expected)&&s.expected>0}))
    .sort((a,b)=>Number(b.fixed)-Number(a.fixed)||b.series.monthly-a.series.monthly)
}

/** The first expected charge on or after `today`, stepping from the last charge. */
export function nextDueFrom(s:Series,today:string):string{
  let next=s.nextExpected>=today?s.nextExpected:s.lastCharged
  for(let i=0;next<today&&i<1000;i++)next=nextChargeDate(next,s.cadence)
  return next
}

/**
 * The manage-recurring-series save for a bill the owner accepted. Cadence,
 * amount and next date are pinned (never null) because assistance only uses
 * fully specified series. Evidence is the detector's latest supporting rows;
 * the server re-checks them.
 */
export function billSavePayload(s:Series,today:string){
  return {action:'save' as const,account_id:s.accountId,merchant_key:s.merchantKey,
    evidence_transaction_ids:s.charges.map(c=>c.transactionId).filter((id):id is string=>!!id).slice(-64),
    state:'active' as const,cadence_override:s.cadence,expected_amount_override:s.expected,
    next_expected_override:nextDueFrom(s,today),reminder_days_before:s.reminderDaysBefore}
}
