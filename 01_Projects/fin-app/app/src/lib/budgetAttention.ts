import {addDays} from './budget'
export type AttentionIssue={key:string;kind:string;label:string;gap_cents:number|null;available_cents:number|null;threshold_cents:number;due_date:string|null;priority:number;line_id?:string;count?:number;issue_hash:string;state:'active'|'acknowledged'|'snoozed';reopened:boolean;reopen_reason:'expired'|'gap_worsened'|'due_date_changed'|'evidence_changed'|null;until:string|null}
export type BudgetAttention={items:AttentionIssue[];total:number;active_count:number;version:string;as_of:string;editable:boolean;undo_operation_id:string|null;forecast_available:boolean}
/** This token binds a form to a server fact, not a locally recomputed gap. */
export function attentionToken(issue:AttentionIssue,source:string,plan:string,version:string){return JSON.stringify([issue.key,issue.issue_hash,source,plan,version])}
export function defaultAttentionDate(asOf:string,end:string){return [addDays(asOf,7),end].sort()[0]}
export function validAttentionDate(date:string,asOf:string,end:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>asOf&&date<=end&&(()=>{try{return addDays(date,0)===date}catch{return false}})()}
export function attentionMessage(i:AttentionIssue){switch(i.kind){
 case 'projected_overspend':return 'This estimate uses recorded net flexible spending plus the median of three covered monthly daily gross rates for the remaining days. It is not settled overspending, available cash or a guarantee.'
 case 'fixed_projected_overspend':return 'This bill looks like it will cost more than planned, going by what’s been matched so far and the payments still due.'
 case 'pending_overage':return 'Pending card charges may take you over your everyday plan once they go through.'
 case 'funding_gap':return 'The allowances in this budget add up to more than your expected income and one-off cash top-up.'
 case 'future_funding_gap':return 'Your continuing allowances need more expected income. A one-off cash top-up does not repeat.'
 case 'overspend':return 'You’ve spent more than this plan, including anything carried over. The shortfall stays in your budget even after you review it.'
 case 'reserve_shortfall':return 'More has been spent from this set-aside than was put in. Reviewing or archiving it doesn’t remove the shortfall.'
 case 'bill_unmatched':return 'This payment hasn’t been matched to a transaction yet. That does not prove the bill is unpaid. Check before changing your plan.'
 case 'goal_due_shortfall':return 'At the current amount, this goal won’t reach its target by its date. This is a plan, not proof of cash available.'
 case 'changed_matches':return 'Some earlier matches no longer line up with their transactions. Check them before relying on these figures.'
 case 'unassigned_credits':return 'Some refunds haven’t been given a purpose yet. They aren’t added to a goal or counted as income automatically.'
 case 'uncategorized':return 'This spending is included in Other but still needs a category. Review it in Ledger.'
 default:return 'Some of this budget’s account history is missing or incomplete, or you’re planning without linked accounts, so some spending may not be counted.'
}}
