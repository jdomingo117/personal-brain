import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
  message: 'Invalid date',
})

const SaveGoal = z.object({
  action: z.literal('save_goal'),
  goal_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  metric: z.enum(['cash', 'net_worth']),
  target_cents: z.number().int().positive().max(1_000_000_000),
  target_date: IsoDate.nullable(),
  status: z.enum(['active', 'paused', 'archived']),
  account_ids: z.array(z.string().uuid()).min(1).max(100),
}).superRefine((body, ctx) => {
  if (new Set(body.account_ids).size !== body.account_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate accounts' })
  }
})
const Undo = z.object({ action: z.literal('undo'), event_id: z.string().uuid(), scope: z.enum(['goal', 'scenario', 'rebaseline']).default('goal') })
const SaveScenario = z.object({ action: z.literal('save_scenario'), goal_id: z.string().uuid(), scenario_id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(120), annual_return_bps: z.number().int().min(-5000).max(5000), include_recurring: z.boolean(), status: z.enum(['active', 'archived']) })
const SaveEvent = z.object({ action: z.literal('save_event'), scenario_id: z.string().uuid(), event_id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(120), amount_cents: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0), cadence: z.enum(['once', 'monthly']), start_date: IsoDate, end_date: IsoDate.nullable() }).superRefine((body, ctx) => {
  if (body.cadence === 'once' && body.end_date) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'One-off events cannot have an end date' })
  if (body.end_date && body.end_date < body.start_date) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date must follow start date' })
})
const DuplicateScenario = z.object({ action: z.literal('duplicate_scenario'), scenario_id: z.string().uuid(), name: z.string().trim().min(1).max(120) })
const Rebaseline = z.object({ action: z.literal('rebaseline'), scenario_id: z.string().uuid(), effective_month: IsoDate })
const Payload = z.discriminatedUnion('action', [SaveGoal, SaveScenario, SaveEvent, DuplicateScenario, Rebaseline, Undo])

Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  if (ctx.body.action === 'undo') {
    const rpc = ctx.body.scope === 'scenario' ? 'undo_planning_scenario_event' : ctx.body.scope === 'rebaseline' ? 'undo_planning_rebaseline' : 'undo_planning_goal_event'
    const { data, error } = await ctx.admin().rpc(rpc, {
      p_tenant_id: ctx.tenantId, p_event_id: ctx.body.event_id, p_actor_id: ctx.user.id,
    })
    if (error) {
      if (error.message?.includes('changed after this action') || error.message?.includes('already undone')) {
        throw new SafeHttpError(409, { error: 'This planning change can no longer be undone.' })
      }
      if (error.message?.includes('not found')) throw new SafeHttpError(404, { error: 'Planning change not found.' })
      throw error
    }
    await ctx.audit(ctx.body.scope === 'scenario' ? 'planning.scenario_change_undone' : 'planning.goal_change_undone', {
      target_type: ctx.body.scope === 'scenario' ? 'planning_scenario' : 'planning_goal', event_id: ctx.body.event_id,
    })
    return data
  }

  if (ctx.body.action === 'save_scenario') {
    const { data: goal, error } = await ctx.db.from('planning_goals').select('id').eq('id', ctx.body.goal_id).maybeSingle()
    if (error) throw error
    if (!goal) throw new SafeHttpError(404, { error: 'Planning goal not found.' })
    const { data, error: saveError } = await ctx.admin().rpc('save_planning_scenario', { p_tenant_id: ctx.tenantId, p_actor_id: ctx.user.id, p_goal_id: ctx.body.goal_id, p_scenario_id: ctx.body.scenario_id, p_name: ctx.body.name, p_annual_return_bps: ctx.body.annual_return_bps, p_include_recurring: ctx.body.include_recurring, p_status: ctx.body.status })
    if (saveError) throw saveError
    if (data.changed) await ctx.audit('planning.scenario_saved', { target_type: 'planning_scenario', target_id: data.scenario_id, event_id: data.event_id })
    return data
  }
  if (ctx.body.action === 'save_event') {
    const { data: scenario, error } = await ctx.db.from('planning_scenarios').select('id').eq('id', ctx.body.scenario_id).maybeSingle()
    if (error) throw error
    if (!scenario) throw new SafeHttpError(404, { error: 'Planning scenario not found.' })
    const { data, error: saveError } = await ctx.admin().rpc('save_planning_event', { p_tenant_id: ctx.tenantId, p_actor_id: ctx.user.id, p_scenario_id: ctx.body.scenario_id, p_event_id: ctx.body.event_id, p_name: ctx.body.name, p_amount_cents: ctx.body.amount_cents, p_cadence: ctx.body.cadence, p_start_date: ctx.body.start_date, p_end_date: ctx.body.end_date })
    if (saveError) throw saveError
    if (data.changed) await ctx.audit('planning.event_saved', { target_type: 'planning_event', target_id: data.event_id, event_id: data.audit_event_id })
    return data
  }
  if (ctx.body.action === 'duplicate_scenario') {
    const { data: scenario, error } = await ctx.db.from('planning_scenarios').select('id').eq('id', ctx.body.scenario_id).maybeSingle()
    if (error) throw error
    if (!scenario) throw new SafeHttpError(404, { error: 'Planning scenario not found.' })
    const { data, error: duplicateError } = await ctx.admin().rpc('duplicate_planning_scenario', {
      p_tenant_id: ctx.tenantId, p_actor_id: ctx.user.id, p_source_scenario_id: ctx.body.scenario_id, p_name: ctx.body.name,
    })
    if (duplicateError) throw duplicateError
    await ctx.audit('planning.scenario_duplicated', { target_type: 'planning_scenario', target_id: data.scenario_id, source_id: ctx.body.scenario_id, event_id: data.event_id })
    return data
  }
  if (ctx.body.action === 'rebaseline') {
    const { data: scenario, error } = await ctx.db.from('planning_scenarios').select('id').eq('id', ctx.body.scenario_id).maybeSingle()
    if (error) throw error
    if (!scenario) throw new SafeHttpError(404, { error: 'Planning baseline not found.' })
    const { data, error: rebaselineError } = await ctx.admin().rpc('rebaseline_planning_scenario', { p_tenant_id: ctx.tenantId, p_actor_id: ctx.user.id, p_scenario_id: ctx.body.scenario_id, p_effective_month: ctx.body.effective_month })
    if (rebaselineError) throw rebaselineError
    await ctx.audit('planning.rebaselined', { target_type: 'planning_scenario', target_id: data.scenario_id, event_id: data.event_id, effective_month: ctx.body.effective_month })
    return data
  }

  // Prove the submitted scope through the caller's RLS client before the
  // service-only RPC writes. The browser cannot attach somebody else's account
  // to its goal even if it guesses a UUID.
  const { data: accounts, error: accountsError } = await ctx.db
    .from('accounts').select('id').in('id', ctx.body.account_ids)
  if (accountsError) throw accountsError
  if (accounts?.length !== ctx.body.account_ids.length) {
    throw new SafeHttpError(404, { error: 'One or more selected accounts were not found.' })
  }
  if (ctx.body.goal_id) {
    const { data: goal, error: goalError } = await ctx.db
      .from('planning_goals').select('id').eq('id', ctx.body.goal_id).maybeSingle()
    if (goalError) throw goalError
    if (!goal) throw new SafeHttpError(404, { error: 'Planning goal not found.' })
  }

  const { data, error } = await ctx.admin().rpc('save_planning_goal', {
    p_tenant_id: ctx.tenantId, p_actor_id: ctx.user.id, p_goal_id: ctx.body.goal_id,
    p_name: ctx.body.name, p_metric: ctx.body.metric, p_target_cents: ctx.body.target_cents,
    p_target_date: ctx.body.target_date, p_status: ctx.body.status, p_account_ids: ctx.body.account_ids,
  })
  if (error) {
    if (error.message?.includes('not found')) throw new SafeHttpError(404, { error: 'Planning goal or account not found.' })
    throw error
  }
  if (data.changed) {
    await ctx.audit('planning.goal_saved', {
      target_type: 'planning_goal', target_id: data.goal_id, event_id: data.event_id,
      metric: ctx.body.metric, status: ctx.body.status, account_count: ctx.body.account_ids.length,
    })
  }
  return data
}))
