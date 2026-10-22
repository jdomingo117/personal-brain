import { detectRecurringSignal, type Charge } from './recurringSignal.ts'
import { cv,ERRATIC_CV } from './stats.ts'

export type RecurringEvidence={as_of:string;normal_from:string;annual_from:string;group_count:number;group_limit:number;observation_limit:number;
 groups:{account_id:string;merchant_key:string;count:number;charges:Charge[]}[]}
/** The SQL adapter owns completeness, scope and limits. No financial aggregate
 * is reconstructed from a capped page. The kernel returns suggestions only. */
export function budgetRecurring(e:RecurringEvidence){
 return {...e,groups:undefined,limited:e.group_count>e.group_limit,proposals:e.groups.map(g=>{
  if(g.count>e.observation_limit||g.charges.some(c=>!Number.isSafeInteger(c.amount)||c.amount<=0))return {account_id:g.account_id,merchant_key:g.merchant_key,count:g.count,state:'manual-required' as const,signal:null}
  const normal=detectRecurringSignal(g.charges.filter(c=>c.date>=e.normal_from),e.as_of)
  const annual=normal?null:detectRecurringSignal(g.charges,e.as_of)
  const signal=normal??(annual?.cadence==='Annual'?annual:null)
  const pair=g.charges.length===2&&Math.abs((Date.parse(g.charges[1].date)-Date.parse(g.charges[0].date))/86400000-365.25)<=30
   &&cv(g.charges.map(c=>c.amount))<ERRATIC_CV&&(Date.parse(e.as_of)-Date.parse(g.charges[1].date))/86400000<=1.5*365.25
  return {account_id:g.account_id,merchant_key:g.merchant_key,count:g.count,state:signal?'detected' as const:pair?'early-annual' as const:'no-pattern' as const,signal}
 })}
}
