import {addDays} from './budget'
export type AttentionIssue={key:string;kind:string;label:string;gap_cents:number|null;available_cents:number|null;threshold_cents:number;due_date:string|null;priority:number;line_id?:string;count?:number;issue_hash:string;state:'active'|'acknowledged'|'snoozed';reopened:boolean;reopen_reason:'expired'|'gap_worsened'|'due_date_changed'|'evidence_changed'|null;until:string|null}
export type BudgetAttention={items:AttentionIssue[];total:number;active_count:number;version:string;as_of:string;editable:boolean;undo_operation_id:string|null;forecast_available:false}
/** This token binds a form to a server fact, not a locally recomputed gap. */
export function attentionToken(issue:AttentionIssue,source:string,plan:string,version:string){return JSON.stringify([issue.key,issue.issue_hash,source,plan,version])}
export function defaultAttentionDate(asOf:string,end:string){return [addDays(asOf,7),end].sort()[0]}
export function validAttentionDate(date:string,asOf:string,end:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>asOf&&date<=end&&(()=>{try{return addDays(date,0)===date}catch{return false}})()}
export function attentionMessage(i:AttentionIssue){switch(i.kind){
 case 'funding_gap':return 'The allowances in this budget add up to more than your expected income and one-off cash top-up.'
 case 'future_funding_gap':return 'Your continuing allowances need more expected income. A one-off cash top-up does not repeat.'
 case 'overspend':return 'Recorded spending is above this allowance, including any carried amount. The shortfall stays in your budget even after review.'
 case 'reserve_shortfall':return 'Matched spending is more than the amount set aside. Archiving or reviewing this does not remove the shortfall.'
 case 'bill_unmatched':return 'This scheduled payment has not been fully matched to recorded activity. That does not prove the bill is unpaid. Check the payment before changing your plan.'
 case 'goal_due_shortfall':return 'The amount in your plan and remaining scheduled contributions do not cover this target by its date. This is a plan estimate, not proof of cash available.'
 case 'changed_matches':return 'Some earlier matches no longer agree with their source. Inspect them before relying on the evidence.'
 case 'unassigned_credits':return 'Refunds or reimbursements have not been assigned a purpose. They are not automatically added to a goal or treated as income.'
 case 'uncategorized':return 'This spending is included in Other but still needs a category. Review it in Ledger.'
 default:return 'Some history is incomplete or unavailable, or you are planning manually. Known activity is not proof that all spending is included.'
}}
