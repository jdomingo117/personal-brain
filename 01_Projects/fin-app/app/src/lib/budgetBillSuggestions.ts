import {nextChargeDate} from './recurring'
import type {Cadence} from './cadence'
import type {BudgetRecurringEvidence} from './budgetItems'

/**
 * Shared rules and wording for bill suggestions, used by assisted setup
 * (BudgetDetectedBills) and the workspace "Find bills" list, so both say the
 * same thing about the same pattern.
 */
export const cadenceLabel:Record<string,string>={Weekly:'weekly',Biweekly:'every two weeks',Monthly:'monthly',Quarterly:'quarterly',Annual:'yearly',Yearly:'yearly'}
export const IMPORT_GAP_NOTE='Its next charge is after your latest import, so it may still be running.'

/**
 * A detected pattern looks stopped only if a charge was due while the account
 * still had activity. If the account's imports end before the next expected
 * charge, the missing charge is missing data, not a stopped bill.
 */
export function stoppedOrGap(nextExpected:string,lastActivity:string|null|undefined):'import-gap'|'stopped'{
  return lastActivity&&nextExpected>lastActivity?'import-gap':'stopped'
}

/** The first expected charge on or after `today`, stepping forward by cadence. */
export function rollForward(next:string,cadence:string,today:string):string{
  if(!(cadence in cadenceLabel))return next
  let d=next
  for(let i=0;d<today&&i<1000;i++)d=nextChargeDate(d,cadence as Cadence)
  return d
}

/** A readable merchant name: the ledger's display name when known, else the key in title case. */
export function merchantLabel(key:string,names:Map<string,string>):string{
  return names.get(key)??key.replace(/\b[a-z]/g,c=>c.toUpperCase())
}

type Proposal=BudgetRecurringEvidence['proposals'][number]
export type Suggestion=Proposal&{kind:'current'|'import-gap'|'stopped'|'possible-annual'|'manual'}

/**
 * Sorts the workspace evidence into what to offer and what to mention quietly:
 * - current: an active pattern;
 * - import-gap: "dormant" only because imports stop before its next charge;
 * - stopped / possible-annual (two charges a year apart) / manual (too many to check):
 *   listed separately, never offered as a ready bill.
 */
export function classifySuggestions(evidence:BudgetRecurringEvidence,lastActivity:Map<string,string|null>):Suggestion[]{
  return evidence.proposals.flatMap<Suggestion>(p=>{
    if(p.state==='no-pattern')return []
    if(p.state==='manual-required')return [{...p,kind:'manual'}]
    if(p.state==='early-annual'||!p.signal)return [{...p,kind:'possible-annual'}]
    if(p.signal.status==='active')return [{...p,kind:'current'}]
    return [{...p,kind:stoppedOrGap(p.signal.nextExpected,lastActivity.get(p.account_id))}]
  })
}
