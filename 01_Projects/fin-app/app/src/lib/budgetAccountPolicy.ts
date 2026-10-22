import type {Snapshot} from './budgetWorkspace'
import type {BudgetItem,BudgetLimit} from './budgetItems'
export type AccountScopeIntent={scope:'period'|'period-and-future'|'future';activity_account_ids:string[];destination_account_ids:string[]}
export type AccountScopeFacts={key:string;start_date:string;end_date:string;actuals:Snapshot['actuals'];scope_valid:boolean;coverage_complete:boolean;opening_carry_cents:number|null;closing_everyday_cents:number|null;provisional_carry:boolean;changed_since_review:boolean;excluded_cents:number;unassigned_credit_cents:number;items:BudgetItem[];limits:BudgetLimit[];claims:{id:string;valid:boolean;amount_cents:number;purpose:string}[]}
export type AccountScopePreview=AccountScopeIntent&{effective_from:string;effective_until:string|null;source_revision:string;plan_version:string;preview_hash:string;before:AccountScopeFacts[];after:AccountScopeFacts[]}
export type AccountPolicy={id:string;version:string;action:'saved'|'undo';effective_from:string;effective_until:string|null}

/** Scope is resolved at the exact boundary, not by gathering every historical membership. */
export function accountScopeAt(s:Snapshot,date:string):Pick<AccountScopeIntent,'activity_account_ids'|'destination_account_ids'>{
 const active=s.account_scope.filter(m=>m.start_date<=date&&(!m.end_date||m.end_date>date))
 return {activity_account_ids:[...new Set(active.filter(m=>m.role==='activity').map(m=>m.original_account_id))].sort(),destination_account_ids:[...new Set(active.filter(m=>m.role==='destination').map(m=>m.original_account_id))].sort()}
}
export function scopeNeedsQualification(p:AccountScopePreview){return p.after.some(row=>!row.scope_valid||!row.coverage_complete)}
export function scopePreviewMatches(p:AccountScopePreview,intent:AccountScopeIntent,s:Snapshot){
 const sorted=(xs:string[])=>[...xs].sort().join(',')
 return p.plan_version===s.plan?.version&&p.source_revision===s.source_revision&&p.scope===intent.scope&&sorted(p.activity_account_ids)===sorted(intent.activity_account_ids)&&sorted(p.destination_account_ids)===sorted(intent.destination_account_ids)
}
