export type HistoryPreparation={plan_id:string;period_id:string;source_revision:string;plan_version:string;completed:number;total:number;ready:boolean}
export type PreparingWorkspace={state:'preparing';tenant_id:string;preparation:HistoryPreparation}
export function isPreparing(value:unknown):value is PreparingWorkspace {
 if(!value||typeof value!=='object'||!('state' in value)||value.state!=='preparing'||!('preparation' in value))return false
 const p=value.preparation as HistoryPreparation
 return !!p&&Number.isSafeInteger(p.completed)&&Number.isSafeInteger(p.total)&&p.completed>=0&&p.total>0&&p.completed<=p.total&&typeof p.ready==='boolean'
}
export function historyRequest(p:HistoryPreparation){return {action:'prepare_history',plan_id:p.plan_id,period_id:p.period_id,expected_source:p.source_revision,expected_plan:p.plan_version}}
