import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError } from './withAuth.ts'

const Money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const Version = z.string().regex(/^(0|[1-9]\d*)$/).max(19).refine(v => /^(0|[1-9]\d*)$/.test(v) && v.length<=19 && BigInt(v) <= 9223372036854775807n)
// Drafts intentionally preserve unfinished JSON input. Ready-setup fields, ownership and money
// are validated by budget_validate_setup inside the atomic activation transaction, not a racy read.
const common = { request_id:z.string().uuid(), expected_source:Version, expected_method:z.string().min(1).max(64) }
const active = {...common,plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_plan:Version}
const AccountScope={scope:z.enum(['period','period-and-future','future']),activity_account_ids:z.array(z.string().uuid()).max(100),destination_account_ids:z.array(z.string().uuid()).max(100)}
const Control={control:z.enum(['pause_budget','resume_budget','archive_line']),line_id:z.string().uuid().nullable(),disposition:z.enum(['retain','release','transfer']).nullable(),target_line_id:z.string().uuid().nullable()}
const Rollover={limits:z.array(z.object({id:z.string().uuid(),category_id:z.string().min(1).max(80),subcategory_id:z.string().max(80).nullable(),custom_subcategory_id:z.string().uuid().nullable(),amount_cents:Money}).strict()).max(50),rules:z.array(z.object({id:z.union([z.literal('other'),z.string().uuid()]),mode:z.enum(['carry','retain','release','transfer']),target:z.union([z.literal('other'),z.string().uuid()]).nullable()}).strict()).min(1).max(200)}
const DateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const FrequencyTemplate=z.object({income_cents:Money,accept_gap:z.boolean(),lines:z.array(z.object({line_id:z.string().uuid(),amount_cents:Money}).strict()).min(1).max(100)}).strict()
const Item=z.object({type:z.enum(['bill','reserve','goal','contribution']),name:z.string().trim().min(1).max(60),target_cents:Money.nullable(),estimated:z.boolean(),due_date:DateOnly.nullable(),
 cadence:z.enum(['once','weekly','fortnightly','monthly','quarterly','annual']),anchor:DateOnly,amount_cents:Money,state:z.enum(['draft','saving','paused','purchase-recorded']),recurring_id:z.string().uuid().nullable(),planning_goal_id:z.string().uuid().nullable(),source_account_id:z.string().uuid().nullable().optional(),source_merchant_key:z.string().min(1).max(240).nullable().optional(),featured:z.boolean().optional()}).strict()
export const BudgetCommand = z.discriminatedUnion('action',[
  z.object({...active,action:z.literal('set_attention'),expected_attention:Version,issue_key:z.string().min(1).max(160),issue_hash:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['acknowledged','snoozed','active']),until:DateOnly.nullable()}).strict(),
  z.object({...active,...Control,action:z.literal('set_control'),preview_hash:z.string().regex(/^[a-f0-9]{64}$/),accept_impact:z.boolean(),accept_incomplete:z.boolean(),accept_carry:z.boolean()}).strict(),
  z.object({...active,...Rollover,action:z.literal('set_rollover'),preview_hash:z.string().regex(/^[a-f0-9]{64}$/),accept_impact:z.boolean(),accept_incomplete:z.boolean()}).strict(),
  z.object({...active,...AccountScope,action:z.literal('set_account_scope'),preview_hash:z.string().regex(/^[a-f0-9]{64}$/),accept_impact:z.boolean(),accept_incomplete:z.boolean()}).strict(),
  z.object({...active,action:z.literal('schedule_frequency'),frequency:z.enum(['monthly','fortnightly']),initial:FrequencyTemplate,continuing:FrequencyTemplate,keep_limits:z.boolean(),accept_incomplete:z.boolean()}).strict(),
  z.object({...active,action:z.literal('cancel_frequency')}).strict(),
  z.object({...active,action:z.literal('apply_frequency')}).strict(),
  z.object({...active,action:z.literal('save_review'),carry_mode:z.enum(['fresh','carry']),accept_incomplete:z.boolean()}).strict(),
  z.object({...active,action:z.literal('reopen_review')}).strict(),
  z.object({...active,action:z.literal('open_next_period'),income_cents:Money,accept_gap:z.boolean(),lines:z.array(z.object({line_id:z.string().uuid(),amount_cents:Money}).strict()).min(1)}).strict(),
  z.object({...active,action:z.literal('save_item'),line_id:z.string().uuid(),item:Item,opening_cents:Money,opening_date:DateOnly,accept_gap:z.boolean()}).strict(),
  z.object({...active,action:z.literal('claim_source'),line_id:z.string().uuid().nullable(),purpose:z.enum(['expense','purchase','refund','exclude','funding']),source_key:z.string().min(1).max(80),amount_cents:Money,
   occurrence_date:DateOnly.nullable(),occurrence_revision_id:z.string().uuid().nullable(),related_claim_id:z.string().uuid().nullable(),complete:z.boolean()}).strict(),
  z.object({...active,action:z.literal('confirm_funding'),line_id:z.string().uuid(),purpose:z.literal('funding'),manual_id:z.string().uuid(),capacity_cents:Money,amount_cents:Money,confirmed_date:DateOnly,note:z.string().trim().min(1).max(200)}).strict(),
  z.object({...active,action:z.literal('reverse_claim'),claim_id:z.string().uuid()}).strict(),
  z.object({...active,action:z.literal('move_allocation'),from_line_id:z.string().uuid(),to_line_id:z.string().uuid(),amount_cents:Money}).strict(),
  z.object({...active,action:z.literal('release_reserve'),from_line_id:z.string().uuid(),to_line_id:z.string().uuid(),amount_cents:Money}).strict(),
  z.object({...active,action:z.literal('set_limits'),limits:z.array(z.object({id:z.string().uuid(),category_id:z.string().min(1).max(80),subcategory_id:z.string().max(80).nullable(),custom_subcategory_id:z.string().uuid().nullable(),amount_cents:Money}).strict()).max(50)}).strict(),
  z.object({...common, action:z.literal('save_draft'),expected_draft:Version,payload:z.record(z.unknown())}).strict(),
  z.object({...common, action:z.literal('activate'),expected_draft:Version,accept_gap:z.boolean()}).strict(),
  z.object({...common, action:z.literal('revise'),plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_plan:Version,
    scope:z.enum(['period','period-and-future']),income_cents:Money,opening_drawdown_cents:Money,accept_gap:z.boolean(),
    lines:z.array(z.object({line_id:z.string().uuid(),amount_cents:Money}).strict()).min(1),}).strict(),
  z.object({...common,action:z.literal('undo'),operation_id:z.string().uuid()}).strict(),
])
export const BudgetQuery = z.discriminatedUnion('action',[
  z.object({action:z.literal('assisted_setup'),frequency:z.enum(['monthly','fortnightly']),start_date:DateOnly,anchor:DateOnly.optional(),account_ids:z.array(z.string().uuid()).max(100)}).strict(),
  z.object({action:z.literal('prepare_history'),plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_source:Version,expected_plan:Version}).strict(),
  z.object({action:z.literal('preview_control'),...Control,plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_source:Version,expected_plan:Version,expected_method:z.string().min(1).max(64)}).strict(),
  z.object({action:z.literal('preview_rollover'),...Rollover,plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_source:Version,expected_plan:Version,expected_method:z.string().min(1).max(64)}).strict(),
  z.object({action:z.literal('preview_account_scope'),...AccountScope,plan_id:z.string().uuid(),period_id:z.string().uuid(),expected_source:Version,expected_plan:Version,expected_method:z.string().min(1).max(64)}).strict(),
  z.object({action:z.literal('sources'),plan_id:z.string().uuid(),period_id:z.string().uuid(),after_date:DateOnly.optional(),after_key:z.string().max(80).optional()}).strict(),
  z.object({action:z.literal('workspace'),period_id:z.string().uuid().optional()}).strict(),
  z.object({action:z.literal('snapshot'),plan_id:z.string().uuid().optional(),period_id:z.string().uuid().optional()}).strict(),
  z.object({action:z.literal('draft')}).strict(),
  z.object({action:z.literal('operation'),request_id:z.string().uuid()}).strict(),
])
/** Never pass database details (which can contain money/names) to generic middleware logging. */
export function budgetFailure(error: { code?: string; message?: string }): never {
  const code = error.message?.match(/budget_[a-z_]+/)?.[0]
  const conflict = ['budget_request_conflict','budget_stale_draft','budget_stale_source','budget_stale_plan','budget_stale_method','budget_undo_conflict','budget_active_conflict']
  if(code==='budget_stale_attention')throw new SafeHttpError(409,{code,message:'This budget check changed. Keep your choice, refresh the saved data and review the latest issue before saving.',retryable:false})
  if(code==='budget_invalid_attention_period')throw new SafeHttpError(422,{code,message:'Review preferences can be changed for the budget currently in progress. Saved history remains available to inspect.',retryable:false})
  if(code==='budget_invalid_attention_date')throw new SafeHttpError(422,{code,message:'Choose a reminder date after today, no later than the end of this budget.',retryable:false})
  if(code==='budget_invalid_accounts')throw new SafeHttpError(422,{code,message:'Choose no more than 100 available AUD accounts for assisted setup.',retryable:false})
  if(code==='budget_stale_assistance')throw new SafeHttpError(409,{code,message:'The history behind these suggestions changed. Recheck it, or explicitly keep your edited amounts as manual estimates.',retryable:false})
  if(code==='budget_paused')throw new SafeHttpError(409,{code,message:'Budget planning is paused. Review the uncovered dates and carry before resuming and opening another budget.',retryable:false})
  if(code==='budget_invalid_archived_line')throw new SafeHttpError(422,{code,message:'This line is archived. Its history and reserve remain available, but future allocations stay at zero.',retryable:false})
  if(code==='budget_invalid_resume_carry')throw new SafeHttpError(422,{code,message:'Review the uncovered dates, reserve effects and carry before resuming budget planning.',retryable:false})
  if(code==='budget_invalid_control_state')throw new SafeHttpError(409,{code,message:'This budget control is no longer available. Refresh and review the latest saved state.',retryable:false})
  if(code==='budget_invalid_disposition')throw new SafeHttpError(422,{code,message:'Choose whether to keep this reserve, release its signed balance to Other, or transfer it to another active reserve.',retryable:false})
  if(code==='budget_stale_preview')throw new SafeHttpError(409,{code,message:'This preview no longer matches your choices or current facts. Keep your choices and review a fresh preview.',retryable:false})
  if(code==='budget_impact_required')throw new SafeHttpError(409,{code,message:'Finish reviewing the budget effects before saving. Completed checks can be continued; no budget change has been saved.',retryable:false})
  if(code==='budget_invalid_scope_acceptance')throw new SafeHttpError(422,{code,message:'Review the budget effects and confirm the changes before saving.',retryable:false})
  if(code==='budget_invalid_policy_limits')throw new SafeHttpError(422,{code,message:'Use Rollover and category settings to change categories from the next budget. Choose what happens to each remaining balance.',retryable:false})
  if(code==='budget_invalid_policy_review')throw new SafeHttpError(422,{code,message:'Your saved category rollover rules already decide what carries forward. Review the results without adding a second carry choice.',retryable:false})
  if(code==='budget_historical_readonly')throw new SafeHttpError(409,{code,message:'A later budget has already been opened. Earlier plans stay unchanged; correct source transactions in Ledger or adjust the latest budget.',retryable:false})
  if(code==='budget_frequency_pending')throw new SafeHttpError(409,{code,message:'A frequency change is already saved. Apply it when its start date arrives, or cancel it before planning another change.',retryable:false})
  if(code==='budget_frequency_needs_review')throw new SafeHttpError(409,{code,message:'Your plan or activity changed after this preview. Cancel the saved change and review a fresh one before applying it.',retryable:false})
  if(code==='budget_frequency_not_pending')throw new SafeHttpError(409,{code,message:'There is no pending frequency change. Refresh to see its latest saved state.',retryable:false})
  if(code==='budget_source_capacity')throw new SafeHttpError(409,{code,message:'Some of this money is already used or matched. Refresh, then review a smaller amount or reverse the earlier match.',retryable:false})
  if(code==='budget_invalid_unfinished_period')throw new SafeHttpError(422,{code,message:'This budget is still in progress. You can review its recorded results after its end date.',retryable:false})
  if(code==='budget_invalid_incomplete_review')throw new SafeHttpError(422,{code,message:'This history is incomplete. Review the missing-history explanation and explicitly confirm that you understand before saving.',retryable:false})
  if (error.code==='42501' || code==='budget_forbidden') throw new SafeHttpError(403,{code:'forbidden',message:'Only the budget owner can make this change.',retryable:false})
  if (code==='budget_not_found' || code==='budget_account_unavailable') throw new SafeHttpError(404,{code:'not_found',message:'This budget or account is not available.',retryable:false})
  if (code && conflict.includes(code)) throw new SafeHttpError(409,{code,message:'This budget changed. Keep your edits and review the latest version.',retryable:false})
  if (code==='budget_disabled') throw new SafeHttpError(503,{code:'disabled',message:'Budget changes are not enabled. Previously saved results are still available.',retryable:false})
  if (code==='budget_gap_confirmation_required') throw new SafeHttpError(422,{code,message:'Review and explicitly accept the funding gap before saving.',retryable:false})
  if (code?.startsWith('budget_invalid') || code==='budget_overflow' || error.code?.startsWith('22')) throw new SafeHttpError(422,{code:code??'invalid_input',message:'Check the budget amounts, dates and selected accounts.',retryable:false})
  if (['23505','23503','23P01'].includes(error.code??'')) throw new SafeHttpError(409,{code:'constraint_conflict',message:'This change conflicts with the saved budget. Review the latest version.',retryable:false})
  throw new SafeHttpError(503,{code:'temporarily_unavailable',message:'The result could not be confirmed. Keep this request and check its saved outcome before trying again.',retryable:true})
}
