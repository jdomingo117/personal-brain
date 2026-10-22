import type {AccountScopeFacts} from './budgetAccountPolicy'
export type ControlIntent={control:'pause_budget'|'resume_budget'|'archive_line';line_id:string|null;disposition:'retain'|'release'|'transfer'|null;target_line_id:string|null}
export type Archive={line_id:string;name:string;from:string;archived_on:string;period_id:string;disposition:'retain'|'release'|'transfer';target_line_id:string|null}
export type ControlState={paused:boolean;paused_on?:string;resumed_on?:string;archives:Archive[]}
export type ControlEvent={id:string;version:string;action:string}
export type ControlPreview=ControlIntent&{before_control:ControlState;after_control:ControlState;before:AccountScopeFacts[];after:AccountScopeFacts[];future_allocations:{line_id:string;amount_cents:number}[];source_revision:string;plan_version:string;preview_hash:string;as_of:string;move_cents:number|null;
 gap:{from:string;until:string;scope_valid:boolean;coverage_complete:boolean;gross_expense_cents:number|null;expense_credits_cents:number|null;windows:{start_date:string;end_date:string;state:'unplanned'}[];reserve_effects:{line_id:string;remaining_cents:number|null}[]}}
/** Bind meaning, not JSON object property order. UI-only drafts never author financial effects. */
export function controlKey(i:ControlIntent){return JSON.stringify([i.control,i.line_id,i.disposition,i.target_line_id])}
export function controlMatches(p:ControlPreview,i:ControlIntent,source:string,version:string){return controlKey(p)===controlKey(i)&&p.source_revision===source&&p.plan_version===version}
export function controlNeedsQualification(p:ControlPreview){return p.after.some(f=>!f.scope_valid||!f.coverage_complete)||!p.gap.scope_valid||!p.gap.coverage_complete}
