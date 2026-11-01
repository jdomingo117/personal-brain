import type {SpendingForecast} from './budgetForecast'

/** Geometry only. All amounts remain server-derived integer cents; ratios are
 * display coordinates, never a second forecast or an inferred cash balance. */
export function forecastComparison(f:SpendingForecast){
 const v=f.flexible,provisional=f.phase==='future',recorded=provisional?0:v.settled_net_cents
 if(!v.available||f.phase==='past'||!v.scope_valid||!v.integrity_ok||!provisional&&!v.coverage_complete)return null
 const projected=v.projected_cents,allowance=v.allocation_cents
 if(recorded===null||projected===null||allowance===null||![recorded,projected,allowance].every(Number.isSafeInteger)||recorded<0||projected<recorded||allowance<=0)return null
 const maximum=Math.max(projected,allowance),percent=(n:number)=>n/maximum*80
 return {recordedPercent:percent(recorded),estimatedPercent:percent(projected)-percent(recorded),allowancePercent:percent(allowance),provisional}
}
