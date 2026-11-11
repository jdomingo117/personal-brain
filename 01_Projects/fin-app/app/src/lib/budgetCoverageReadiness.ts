import {addDays,addMonths,dateParts} from './budget'
import type {AssistanceResult} from './budgetAssistance'
import type {AccountActivity} from './budgetAccountActivity'

/** Calendar months needed before history-based suggestions are offered. */
export const COVERAGE_MONTHS_NEEDED=3

export type CoverageMonth={start_date:string;end_date:string}
export type AccountReadiness={
  account_id:string
  /** One entry per window month: true when this account has a coverage gap overlapping it. */
  missing:boolean[]
  /** Inclusive dates a single owner confirmation would need to cover, capped at today. Null when nothing is missing. */
  confirm:{first_date:string;last_date:string}|null
}
export type CoverageReadiness={months:CoverageMonth[];accounts:AccountReadiness[];ready_months:number;needed:number}

/** The six complete calendar months the server checks before the requested start. */
export function coverageWindow(startDate:string):CoverageMonth[]{
  const {year,month}=dateParts(startDate)
  const first=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-01`
  return Array.from({length:6},(_,i)=>{const start=addMonths(first,i-6,1);return {start_date:start,end_date:addMonths(start,1,1)}})
}

/**
 * Turns the server's per-account gaps into a month-by-account checklist, plus the
 * one date range per account that would close every listed gap. Display only:
 * eligibility is still decided by the server and assistanceEligible().
 */
export function coverageReadiness(result:AssistanceResult,today:string):CoverageReadiness{
  dateParts(today)
  const months=coverageWindow(result.start_date)
  const windowStart=months[0].start_date,windowEnd=months[months.length-1].end_date
  const accounts=result.account_ids.map<AccountReadiness>(account_id=>{
    const gaps=result.missing_coverage.filter(g=>g.account_id===account_id)
    const missing=months.map(m=>gaps.some(g=>g.start_date<m.end_date&&g.end_date>m.start_date))
    if(!gaps.length)return {account_id,missing,confirm:null}
    // Monthly gaps are the calendar months themselves. Two-week gaps don't list
    // missing calendar months, so those also span the full month window.
    const fortnightly=result.frequency==='fortnightly'
    const first=gaps.reduce((min,g)=>g.start_date<min?g.start_date:min,fortnightly?windowStart:gaps[0].start_date)
    const endExclusive=gaps.reduce((max,g)=>g.end_date>max?g.end_date:max,fortnightly?windowEnd:gaps[0].end_date)
    const last=addDays(endExclusive,-1)<today?addDays(endExclusive,-1):today
    return {account_id,missing,confirm:first<=last?{first_date:first,last_date:last}:null}
  })
  const ready_months=months.filter((_,i)=>accounts.length>0&&accounts.every(a=>!a.missing[i])).length
  return {months,accounts,ready_months,needed:COVERAGE_MONTHS_NEEDED}
}

/**
 * For an account in regular use whose latest activity is well before the end of
 * the proposed range, the gap is most likely a missing import. Suggest confirming
 * only through the last recorded day instead. Null when no cap applies.
 */
export function importCappedRange(range:{first_date:string;last_date:string},a:AccountActivity|undefined,graceDays=14):{first_date:string;last_date:string}|null{
  if(!a||!a.last_activity_date||a.recent_activity_count===0)return null
  if(addDays(a.last_activity_date,graceDays)>=range.last_date||a.last_activity_date<range.first_date)return null
  return {first_date:range.first_date,last_date:a.last_activity_date}
}
