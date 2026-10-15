import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'

const Cadence = z.enum(['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual'])
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
  message: 'Invalid date',
})

const SavePayload = z.object({
  action: z.literal('save'),
  account_id: z.string().uuid(),
  merchant_key: z.string().trim().min(1).max(200).refine((value) => !value.includes('\0'), 'Invalid merchant key'),
  // These are the detector's current supporting rows, not a browser authority.
  // They are re-read below through caller RLS before a service-only write.
  evidence_transaction_ids: z.array(z.string().uuid()).min(3).max(64),
  state: z.enum(['active', 'stopped', 'dismissed']),
  cadence_override: Cadence.nullable(),
  expected_amount_override: z.number().int().positive().max(100_000_000).nullable(),
  next_expected_override: IsoDate.nullable(),
  reminder_days_before: z.number().int().min(0).max(60).nullable(),
}).superRefine((payload, ctx) => {
  if (new Set(payload.evidence_transaction_ids).size !== payload.evidence_transaction_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate supporting transactions' })
  }
})
const UndoPayload = z.object({ action: z.literal('undo'), event_id: z.string().uuid() })
const Payload = z.discriminatedUnion('action', [SavePayload, UndoPayload])

Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  if (ctx.body.action === 'undo') {
    const { data, error } = await ctx.admin().rpc('undo_recurring_series_override_event', {
      p_tenant_id: ctx.tenantId,
      p_event_id: ctx.body.event_id,
      p_actor_id: ctx.user.id,
    })
    if (error) {
      if (error.message?.includes('changed after this action') || error.message?.includes('already undone')) {
        throw new SafeHttpError(409, { error: 'This recurring change can no longer be undone.' })
      }
      if (error.message?.includes('not found')) throw new SafeHttpError(404, { error: 'Recurring change not found.' })
      throw error
    }
    await ctx.audit('recurring_series.change_undone', {
      target_type: 'recurring_series_override', event_id: ctx.body.event_id,
    })
    return data
  }

  // The current detector is deliberately client-side. Evidence still must be
  // proved server-side: the submitted IDs must be visible expenses for this
  // tenant, account and normalised merchant. The browser can never write an
  // override for somebody else's account or arbitrary key.
  const { data: evidence, error: evidenceError } = await ctx.db
    .from('transactions_analytic')
    .select('id,account_id,merchant_key,kind,amount,pending,is_transfer')
    .in('id', ctx.body.evidence_transaction_ids)
    .eq('tenant_id', ctx.tenantId)
  if (evidenceError) throw evidenceError
  if (evidence?.length !== ctx.body.evidence_transaction_ids.length) {
    throw new SafeHttpError(404, { error: 'One or more supporting transactions were not found.' })
  }
  if (evidence.some((row) => row.account_id !== ctx.body.account_id
    || row.merchant_key !== ctx.body.merchant_key
    || row.kind !== 'expense'
    || row.amount >= 0
    || row.pending
    || row.is_transfer)) {
    throw new SafeHttpError(409, { error: 'The detected series no longer matches its supporting transactions.' })
  }

  const { data, error } = await ctx.admin().rpc('save_recurring_series_override', {
    p_tenant_id: ctx.tenantId,
    p_actor_id: ctx.user.id,
    p_account_id: ctx.body.account_id,
    p_merchant_key: ctx.body.merchant_key,
    p_state: ctx.body.state,
    p_cadence_override: ctx.body.cadence_override,
    p_expected_amount_override: ctx.body.expected_amount_override,
    p_next_expected_override: ctx.body.next_expected_override,
    p_reminder_days_before: ctx.body.reminder_days_before,
  })
  if (error) {
    if (error.message?.includes('account not found')) throw new SafeHttpError(404, { error: 'Account not found.' })
    throw error
  }
  if (data.changed) {
    await ctx.audit('recurring_series.saved', {
      target_type: 'recurring_series_override', target_id: data.override_id,
      event_id: data.event_id, account_id: ctx.body.account_id,
      merchant_key: ctx.body.merchant_key, state: ctx.body.state,
      fields_overridden: [
        ctx.body.cadence_override !== null && 'cadence',
        ctx.body.expected_amount_override !== null && 'expected_amount',
        ctx.body.next_expected_override !== null && 'next_expected',
        ctx.body.reminder_days_before !== null && 'reminder',
      ].filter(Boolean),
    })
  }
  return data
}))
