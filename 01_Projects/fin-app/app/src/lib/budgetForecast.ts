import {today,dateParts,addMonths,daysBetween} from './budget'
import type {Snapshot,BudgetReadState} from './budgetWorkspace'
export const BUDGET_FORECAST_METHOD='budget-forecast-v1'
export type ForecastStatus='within_plan'|'likely_to_exceed'|'exceeded'|'check_data'|'unavailable'
export type ForecastMonth={start_date:string;end_date:string;days:number;gross_cents:number|null}
export type ForecastFixed={line_id:string;name:string;available:boolean;reason:string|null;allocation_cents:number|null;settled_net_cents:number|null;expected_remaining_cents:number|null;overdue_expected_cents:number|null;projected_cents:number|null;status:ForecastStatus;occurrences:{date:string;expected_cents:number;matched_cents:number;remaining_cents:number}[]}
export type SpendingForecast={method:string;source_revision:string;plan_version:string;period_id:string;as_of:string;checked_at:string;through_date:string|null;phase:'past'|'current'|'future';flexible:{line_id:string;available:boolean;reason:string|null;status:ForecastStatus;allocation_cents:number|null;settled_net_cents:number|null;remaining_allocation_cents:number|null;pending_expense_cents:number|null;pending_overage:boolean;projected_cents:number|null;remaining_days:number;threshold_cents:number;history:ForecastMonth[];median:ForecastMonth|null;policy_names:string[];scope_valid:boolean;coverage_complete:boolean;integrity_ok:boolean};fixed:ForecastFixed[]}
/** Bind derived estimates to the same gated snapshot and local calculation date.
 * Never substitute a retained estimate for a fresh current-period result. */
export function forecastReadProblem(s:Snapshot,state:BudgetReadState,pending=false,clock=()=>new Date()):string|null{
 const f=s.details?.forecast
 if(state!=='ready'||pending)return 'Refresh saved data before relying on a spending estimate. Previously loaded facts may be out of date.'
 if(!f)return 'Spending forecast unavailable. Refresh saved data to check the estimate.'
 if(f.method!==BUDGET_FORECAST_METHOD||f.source_revision!==s.source_revision||f.plan_version!==s.plan?.version||f.period_id!==s.period?.id)return 'The forecast basis changed. Refresh saved data before relying on this estimate.'
 if(f.as_of!==today({now:clock},s.plan!.timezone))return 'This estimate is from a different local date. Refresh saved data to check today’s remaining days.'
 const amounts=[f.flexible.allocation_cents,f.flexible.settled_net_cents,f.flexible.remaining_allocation_cents,f.flexible.pending_expense_cents,f.flexible.projected_cents,f.flexible.threshold_cents,f.flexible.median?.gross_cents??null,...f.flexible.history.map(x=>x.gross_cents),...f.fixed.flatMap(x=>[x.allocation_cents,x.settled_net_cents,x.expected_remaining_cents,x.overdue_expected_cents,x.projected_cents,...x.occurrences.flatMap(o=>[o.expected_cents,o.matched_cents,o.remaining_cents])])]
 if(amounts.some(x=>x!==null&&!Number.isSafeInteger(x))||!Number.isInteger(f.flexible.remaining_days)||f.flexible.remaining_days<0)return 'The complete exact-cent estimate is unavailable. Refresh saved data or review the source amounts.'
 if(!Number.isFinite(Date.parse(f.checked_at)))return 'The estimate timestamp is unavailable. Refresh saved data.'
 if(f.flexible.available&&f.flexible.median&&!f.flexible.history.some(x=>x.start_date===f.flexible.median!.start_date&&x.end_date===f.flexible.median!.end_date&&x.days===f.flexible.median!.days&&x.gross_cents===f.flexible.median!.gross_cents))return 'The selected historical rate is unavailable. Refresh saved data.'
 if(f.flexible.available&&(!f.flexible.scope_valid||!f.flexible.integrity_ok||f.phase==='current'&&!f.flexible.coverage_complete))return 'Check data: the complete scope and evidence are required before relying on an estimate.'
 if(f.flexible.available&&(f.flexible.allocation_cents===null||f.flexible.median===null||f.flexible.projected_cents===null||f.flexible.history.length!==3||f.flexible.history.some(x=>x.gross_cents===null||x.gross_cents<0||!Number.isInteger(x.days)||x.days<28||x.days>31)))return 'The full historical basis is unavailable. Refresh saved data before relying on this estimate.'
 try{for(const m of f.flexible.history){dateParts(m.start_date);dateParts(m.end_date);if(!m.start_date.endsWith('-01')||addMonths(m.start_date,1)!==m.end_date||daysBetween(m.start_date,m.end_date)!==m.days||m.end_date>f.as_of)throw Error('invalid basis')}if(!['within_plan','likely_to_exceed','exceeded','check_data','unavailable'].includes(f.flexible.status)||!f.flexible.available&&!['check_data','unavailable'].includes(f.flexible.status))throw Error('invalid status')}catch{return 'The complete historical basis or status is unavailable. Refresh saved data.'}
 return null
}
export function forecastReason(reason:string|null){switch(reason){
 case 'not_enough_history':return 'Not enough history to estimate finish. Three fully covered complete months are required; missing months are not zero.'
 case 'no_accounts':return 'Spending forecast unavailable without activity accounts. Your manual allocation is still usable.'
 case 'invalid_scope':return 'Check data: one or more selected accounts or saved scope dates are unavailable.'
 case 'incomplete_coverage':return 'Check data: current-period coverage is incomplete. Known activity alone cannot establish a Within plan estimate.'
 case 'unresolved_evidence':return 'Check data: unresolved transfers or changed matches can alter flexible spending.'
 case 'incomplete_fixed_schedule':return 'Check data: confirm each fixed bill’s amount and schedule before relying on a spending estimate.'
 case 'historical_period':return 'This is a completed period. Look back shows recorded results; a new forecast is not created retrospectively.'
 case 'amount_too_large':return 'The complete estimate exceeds safe exact-cent bounds. No rounded or partial estimate is shown.'
 default:return 'Estimate unavailable. Review the complete history and saved inputs.'
}}
